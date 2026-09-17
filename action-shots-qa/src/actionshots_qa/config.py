from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Settings:
    values: dict[str, Any]

    def __getattr__(self, name: str) -> Any:
        try:
            return self.values[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def as_json(self) -> str:
        return json.dumps(self.values, sort_keys=True)


def load_settings(override: Path | None = None) -> Settings:
    data = json.loads(files("actionshots_qa").joinpath("defaults.json").read_text())
    if override:
        custom = json.loads(Path(override).read_text(encoding="utf-8"))
        weights = {**data.get("weights", {}), **custom.pop("weights", {})}
        data.update(custom)
        data["weights"] = weights
    return Settings(data)

