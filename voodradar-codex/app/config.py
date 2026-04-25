"""Centralized runtime configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional before deps are installed
    load_dotenv = None


DEFAULT_DEMO_GAMES = ("Marble Sort", "Block Jam", "Color Merge")


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded from environment variables."""

    cache_dir: Path
    max_creatives: int
    demo_games: tuple[str, ...]


def load_settings() -> Settings:
    """Load settings after optionally sourcing a local `.env` file."""
    if load_dotenv is not None:
        load_dotenv()

    cache_dir = Path(os.environ.get("HOOKLENS_CACHE_DIR", "data/cache"))
    max_creatives = int(os.environ.get("HOOKLENS_MAX_CREATIVES", "9"))

    raw_demo_games = os.environ.get("HOOKLENS_DEMO_GAMES")
    if raw_demo_games:
        demo_games = tuple(
            item.strip() for item in raw_demo_games.split(",") if item.strip()
        )
    else:
        demo_games = DEFAULT_DEMO_GAMES

    return Settings(
        cache_dir=cache_dir,
        max_creatives=max_creatives,
        demo_games=demo_games,
    )

