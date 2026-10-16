//! The OpenRouter client: one chat completion, and the list of models that
//! can use tools. Every failure becomes a sentence the conversation can show.

use crate::Model;
use serde_json::Value;
use std::time::Duration;

/// How long one model turn may take before it counts as a network failure.
const CHAT_TIMEOUT: Duration = Duration::from_secs(600);
const MODELS_TIMEOUT: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
/// The largest reply read, so a runaway answer cannot fill memory.
const BODY_LIMIT: u64 = 64 * 1024 * 1024;
/// The most pages of models followed.
const MODEL_PAGES: usize = 50;

fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .http_status_as_error(false)
        .build()
        .into()
}

/// `POST {base}/chat/completions`, not streamed. Returns the reply's first
/// choice's message.
pub fn chat(base_url: &str, key: &str, body: &Value) -> Result<Value, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let response = agent(CHAT_TIMEOUT)
        .post(&url)
        .header("Authorization", &format!("Bearer {key}"))
        .header("HTTP-Referer", "https://github.com/Spumcake/Inpainter")
        .header("X-Title", "Inpainter")
        .header("Content-Type", "application/json")
        .send(body.to_string());
    let reply = read(response)?;
    message(&reply)
}

/// The first choice's message of a chat reply, or why there is none.
pub fn message(reply: &Value) -> Result<Value, String> {
    if let Some(error) = reply.get("error") {
        return Err(format!("The model failed: {}.", error_text(error)));
    }
    let choice = reply
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .ok_or_else(|| String::from("The model's reply held no answer."))?;
    if let Some(error) = choice.get("error") {
        return Err(format!("The model failed: {}.", error_text(error)));
    }
    match choice.get("message") {
        Some(message) if message.is_object() => Ok(message.clone()),
        _ => Err(String::from("The model's reply held no message.")),
    }
}

/// `GET {base}/models`, every page, keeping the models that can use tools,
/// sorted by name.
pub fn models(base_url: &str, key: Option<&str>) -> Result<Vec<Model>, String> {
    let base = base_url.trim_end_matches('/');
    let agent = agent(MODELS_TIMEOUT);
    let mut url = format!("{base}/models?supported_parameters=tools");
    let mut found: Vec<Model> = Vec::new();
    for _ in 0..MODEL_PAGES {
        let mut request = agent.get(&url);
        if let Some(key) = key {
            request = request.header("Authorization", &format!("Bearer {key}"));
        }
        let page = read(request.call())?;
        if let Some(error) = page.get("error") {
            return Err(format!("OpenRouter could not list the models: {}.", error_text(error)));
        }
        let Some(data) = page.get("data").and_then(Value::as_array) else {
            return Err(String::from("OpenRouter's model list could not be read."));
        };
        for model in data.iter().filter_map(tool_model) {
            if !found.iter().any(|known| known.id == model.id) {
                found.push(model);
            }
        }
        match page.pointer("/links/next").and_then(Value::as_str) {
            Some(next) if !next.is_empty() => url = resolve(base, next),
            _ => break,
        }
    }
    found.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(found)
}

/// One entry of the model list, when it supports tools.
pub fn tool_model(entry: &Value) -> Option<Model> {
    let id = entry.get("id")?.as_str()?.to_string();
    let tools = entry
        .get("supported_parameters")
        .and_then(Value::as_array)
        .is_some_and(|parameters| parameters.iter().any(|p| p.as_str() == Some("tools")));
    if !tools {
        return None;
    }
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .map(String::from)
        .unwrap_or_else(|| id.clone());
    let images = entry
        .pointer("/architecture/input_modalities")
        .and_then(Value::as_array)
        .is_some_and(|modalities| modalities.iter().any(|m| m.as_str() == Some("image")));
    Some(Model { id, name, images })
}

/// A next-page link: absolute, or a path on the API's own host.
fn resolve(base: &str, next: &str) -> String {
    if next.starts_with("http://") || next.starts_with("https://") {
        return next.to_string();
    }
    let origin = match base.find("://") {
        Some(scheme) => match base[scheme + 3..].find('/') {
            Some(path) => &base[..scheme + 3 + path],
            None => base,
        },
        None => base,
    };
    if next.starts_with('/') {
        format!("{origin}{next}")
    } else {
        format!("{base}/{next}")
    }
}

/// The body of a reply as JSON, or a sentence saying why not, with
/// OpenRouter's own message for a status that is not a success.
fn read(response: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<Value, String> {
    let mut response = response.map_err(|error| format!("Could not reach OpenRouter: {error}."))?;
    let status = response.status();
    let text = response
        .body_mut()
        .with_config()
        .limit(BODY_LIMIT)
        .read_to_string()
        .map_err(|error| format!("OpenRouter's reply could not be read: {error}."))?;
    let json = serde_json::from_str::<Value>(&text);
    if !status.is_success() {
        let detail = json
            .ok()
            .and_then(|body| body.get("error").map(error_text))
            .unwrap_or_else(|| {
                let text = text.trim();
                if text.is_empty() {
                    String::from("no message")
                } else {
                    text.chars().take(300).collect()
                }
            });
        return Err(format!("OpenRouter answered {}: {detail}.", status.as_u16()));
    }
    json.map_err(|_| String::from("OpenRouter's reply was not JSON."))
}

/// OpenRouter's `{code, message, metadata?}`, as one line, with the
/// provider's own words when it passed them on.
fn error_text(error: &Value) -> String {
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| error.to_string());
    let raw = error
        .pointer("/metadata/raw")
        .map(|raw| match raw.as_str() {
            Some(text) => text.to_string(),
            None => raw.to_string(),
        })
        .filter(|raw| !raw.trim().is_empty() && !message.contains(raw.as_str()));
    let line = match raw {
        Some(raw) => format!("{message} ({})", raw.chars().take(300).collect::<String>()),
        None => message,
    };
    line.trim_end_matches('.').to_string()
}

#[cfg(test)]
mod tests {
    use super::resolve;

    #[test]
    fn next_page_links_resolve_on_the_api_host() {
        let base = "https://openrouter.ai/api/v1";
        assert_eq!(
            resolve(base, "/api/v1/models?offset=500"),
            "https://openrouter.ai/api/v1/models?offset=500"
        );
        assert_eq!(resolve(base, "https://x.test/m"), "https://x.test/m");
    }
}
