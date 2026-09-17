from __future__ import annotations

import json
import sys

import click

from src.core import run_core
from src.errors import CoreError
from src.session import launch


def write_json(payload: dict, *, error: bool = False) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)
    if error:
        sys.exit(1)


@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx: click.Context) -> None:
    if ctx.invoked_subcommand is None:
        launch()


@cli.group()
def auth_group() -> None:
    pass


cli.add_command(auth_group, name="auth")


@auth_group.command("authorize-url")
@click.option("--redirect-uri", required=True)
def authorize_url(redirect_uri: str) -> None:
    write_json(run_core(["auth", "authorize-url", "--redirect-uri", redirect_uri]))


@auth_group.command("exchange")
@click.option("--code", required=True)
@click.option("--state", required=True)
def exchange(code: str, state: str) -> None:
    write_json(run_core(["auth", "exchange", "--code", code, "--state", state]))


@auth_group.command("status")
def status() -> None:
    write_json(run_core(["auth", "status"]))


@auth_group.command("logout")
def logout() -> None:
    write_json(run_core(["auth", "logout"]))


@cli.command("invoke")
@click.option("--skill", required=True)
def invoke(skill: str) -> None:
    params = json.load(sys.stdin)
    if not isinstance(params, dict):
        raise CoreError("Invocation parameters must be an object")
    write_json(run_core(["invoke", "--skill", skill], params))


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
