"""Pre-cache the default demo games for fast Sunday-morning demos."""

from __future__ import annotations

import sys
from pathlib import Path

from rich.console import Console

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import load_settings
from app.logging_utils import configure_logging
from app.pipeline import run_pipeline


def main() -> None:
    """Generate cached reports for the configured demo games."""
    configure_logging()
    settings = load_settings()
    console = Console()

    console.rule("[bold cyan]HookLens Precache")
    for game_name in settings.demo_games:
        report = run_pipeline(game_name, cached=False)
        console.print(
            f"[green]✓[/green] {report.target_game.name} "
            f"→ {len(report.top_archetypes)} archetypes / "
            f"{len(report.final_variants)} variants"
        )


if __name__ == "__main__":
    main()
