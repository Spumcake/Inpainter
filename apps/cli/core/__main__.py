from __future__ import annotations

from urllib.parse import urlencode

import click
from api.auth_service import auth_base_url, exchange_code
from api.supabase import refresh_session

from core.errors import CliError
from core.output import write_json
from core.pending import clear_pending, take_pending, write_pending
from core.pkce import pkce_challenge, random_b64
from core.session import (
    clear_session,
    load_session,
    session_from_token_body,
    session_is_fresh,
    write_session,
    now_secs,
)


@click.group()
def cli() -> None:
    pass


@cli.group()
def auth() -> None:
    pass


@auth.command("authorize-url")
@click.option("--redirect-uri", required=True)
def authorize_url(redirect_uri: str) -> None:
    state = random_b64()
    verifier = random_b64()
    challenge = pkce_challenge(verifier)
    write_pending(state, verifier)
    query = urlencode(
        {
            "state": state,
            "challenge": challenge,
            "redirect_uri": redirect_uri,
            "_": str(now_secs()),
        }
    )
    write_json(
        {
            "authorize_url": f"{auth_base_url()}/sign-in?{query}",
            "state": state,
        }
    )


@auth.command("exchange")
@click.option("--code", required=True)
@click.option("--state", required=True)
def exchange(code: str, state: str) -> None:
    pending = take_pending(state)
    body = exchange_code(code, pending.verifier)
    write_session(session_from_token_body(body))
    write_json({"authenticated": True})


@auth.command("status")
def status() -> None:
    session = load_session()
    if session is None:
        write_json({"authenticated": False})
        return
    if session_is_fresh(session):
        write_json({"authenticated": True})
        return
    try:
        refreshed = session_from_token_body(refresh_session(session.refresh_token))
        write_session(refreshed)
        write_json({"authenticated": True})
    except CliError:
        clear_session()
        write_json({"authenticated": False})


@auth.command("logout")
def logout() -> None:
    clear_pending()
    clear_session()
    write_json({"authenticated": False})


def main() -> None:
    try:
        cli.main(standalone_mode=False)
    except click.ClickException as exc:
        write_json({"error": exc.format_message()}, error=True)
    except CliError as exc:
        write_json({"error": str(exc)}, error=True)
    except SystemExit:
        raise
    except Exception as exc:
        write_json({"error": str(exc)}, error=True)


if __name__ == "__main__":
    main()
