from pathlib import Path


def authoring_root() -> Path:
    package = Path(__file__).resolve().parent
    return package.parents[1]


def schema_dir() -> Path:
    return authoring_root() / "schema" / "global"


def scripts_dir() -> Path:
    return authoring_root() / "scripts" / "shared"
