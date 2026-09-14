from pathlib import Path


def client_root() -> Path:
    package = Path(__file__).resolve().parent
    if (package / "policy").is_dir() or (package / "schema").is_dir():
        return package
    return package.parents[1]


def schema_dir() -> Path:
    return client_root() / "schema"


def policy_dir() -> Path:
    return client_root() / "policy"
