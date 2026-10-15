use protocol::{AppMessage, ContentsKind, HostMessage, PanelSide};
use std::io::{BufRead, Write};

fn main() {
    {
        let mut stdout = std::io::stdout().lock();
        let declaration = [
            AppMessage::Hello {
                protocol: protocol::PROTOCOL_VERSION,
            },
            AppMessage::Tab {
                id: String::from("template"),
                label: String::from("Template"),
            },
            AppMessage::Contents {
                tab: String::from("template"),
                kind: ContentsKind::Grid,
            },
            AppMessage::Panel {
                tab: String::from("template"),
                side: PanelSide::Right,
            },
            AppMessage::End,
        ];
        for message in &declaration {
            let _ = stdout.write_all(protocol::encode_app_message(message).as_bytes());
        }
        let _ = stdout.flush();
    }

    let stdin = std::io::stdin();
    let input = stdin.lock();
    for line in input.lines() {
        let Ok(line) = line else {
            break;
        };
        // A ping is answered so the host knows this program is responding,
        // and with nothing unsaved, a quit is ready at once.
        let reply = match protocol::parse_host_message(&line) {
            Ok(HostMessage::Shutdown) => break,
            Ok(HostMessage::Ping) => AppMessage::Pong,
            Ok(HostMessage::Quit) => AppMessage::QuitReady,
            _ => continue,
        };
        let mut stdout = std::io::stdout().lock();
        let _ = stdout.write_all(protocol::encode_app_message(&reply).as_bytes());
        let _ = stdout.flush();
    }
}
