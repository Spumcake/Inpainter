from __future__ import annotations

import click
import json
import sys
from inpainter.operations.capabilities import invoke as invoke_skill

from inpainter.errors import CoreError
from inpainter.operations import auth
from inpainter.output import write_json


@click.group()
def cli() -> None:
    pass


@cli.group()
def auth_group() -> None:
    pass


cli.add_command(auth_group, name="auth")


@auth_group.command("authorize-url")
@click.option("--redirect-uri", required=True)
def authorize_url(redirect_uri: str) -> None:
    write_json(auth.authorize_url(redirect_uri))


@auth_group.command("exchange")
@click.option("--code", required=True)
@click.option("--state", required=True)
def exchange(code: str, state: str) -> None:
    write_json(auth.exchange(code, state))


@auth_group.command("status")
def status() -> None:
    write_json(auth.status())


@auth_group.command("logout")
def logout() -> None:
    write_json(auth.logout())


@cli.command("invoke")
@click.option("--skill", required=True)
def invoke(skill: str) -> None:
    """Invoke a skill with a JSON parameter object on stdin."""
    params = json.load(sys.stdin)
    if not isinstance(params, dict):
        raise CoreError("Invocation parameters must be an object")
    write_json(invoke_skill(skill, params))


def main() -> None:
    try:
        cli.main(standalone_mode=False)
    except click.ClickException as exc:
        write_json(auth.crash(exc.format_message()), error=True)
    except CoreError as exc:
        write_json(auth.crash(str(exc)), error=True)
    except SystemExit:
        raise
    except Exception as exc:
        write_json(auth.crash(str(exc)), error=True)


if __name__ == "__main__":
    main()
