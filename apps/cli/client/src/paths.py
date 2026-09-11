from pathlib import Path


def client_root() -> Path:
    package = Path(__file__).resolve().parent
    if (package / "scripts").is_dir():
        return package
    return package.parents[1]


def schema_dir() -> Path:
    return client_root() / "schema"


def scripts_dir() -> Path:
    return client_root() / "scripts"


def layouts_dir() -> Path:
    return scripts_dir() / "layouts"
