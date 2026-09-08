import json
import sys
from typing import Any


def write_json(payload: dict[str, Any], *, error: bool = False) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)
    if error:
        sys.exit(1)
