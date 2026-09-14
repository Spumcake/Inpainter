import os
from pathlib import Path


def config_home() -> Path:
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        return Path(xdg)
    return Path.home() / ".config"


def auth_dir() -> Path:
    return config_home() / "spumcake" / "inpainter" / "auth"


def core_state_dir() -> Path:
    return config_home() / "spumcake" / "inpainter" / "core"


def package_dir() -> Path:
    return Path(__file__).resolve().parent


def core_root() -> Path:
    package = package_dir()
    sibling = package.parent
    if (sibling / "schema").is_dir() and (sibling / "policy").is_dir():
        return sibling
    if (package / "schema").is_dir() and (package / "policy").is_dir():
        return package
    return sibling


def schema_dir() -> Path:
    return core_root() / "schema"


def policy_dir() -> Path:
    return core_root() / "policy"
