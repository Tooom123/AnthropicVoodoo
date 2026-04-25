"""Small disk-cache helpers used across the pipeline."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

ModelT = TypeVar("ModelT", bound=BaseModel)


def slugify(value: str) -> str:
    """Convert a free-form string to a stable filesystem slug."""
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "hooklens"


def fingerprint(parts: list[str]) -> str:
    """Build a short stable hash from a small set of strings."""
    joined = "::".join(parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:10]


def ensure_dir(path: Path) -> Path:
    """Create a directory tree if it does not exist."""
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_model(path: Path, model: BaseModel) -> None:
    """Persist a Pydantic model as pretty JSON."""
    ensure_dir(path.parent)
    path.write_text(model.model_dump_json(indent=2), encoding="utf-8")


def write_json(path: Path, payload: dict | list) -> None:
    """Persist JSON payloads with deterministic formatting."""
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def read_model(path: Path, model_type: type[ModelT]) -> ModelT:
    """Load a Pydantic model from a JSON file."""
    return model_type.model_validate_json(path.read_text(encoding="utf-8"))

