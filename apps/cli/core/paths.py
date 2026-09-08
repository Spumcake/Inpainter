import os
from pathlib import Path


def config_home() -> Path:
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        return Path(xdg)
    return Path.home() / ".config"


def auth_dir() -> Path:
    return config_home() / "spumcake" / "inpainter" / "auth"
