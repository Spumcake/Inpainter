from __future__ import annotations

import click
from inpainter.errors import CoreError
from inpainter.operations import auth
from inpainter.output import write_json

from src.session import launch
from inpainter.__main__ import invoke


@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx: click.Context) -> None:
    if ctx.invoked_subcommand is None:
        launch()


@cli.group()
def auth_group() -> None:
    pass


cli.add_command(auth_group, name="auth")
cli.add_command(invoke)


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


def main() -> None:
    try:
        cli.main(standalone_mode=False)
    except click.ClickException as exc:
        write_json({"error": exc.format_message()}, error=True)
    except CoreError as exc:
        write_json({"error": str(exc)}, error=True)
    except SystemExit:
        raise
    except Exception as exc:
        write_json({"error": str(exc)}, error=True)


if __name__ == "__main__":
    main()
