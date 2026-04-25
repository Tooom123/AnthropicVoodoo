"""Local placeholder asset generation used before Scenario MCP is wired."""

from __future__ import annotations

import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.cache import ensure_dir, slugify
from app.models import CreativeBrief, GameDNA, GeneratedVariant


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def _render_asset(
    path: Path,
    game_dna: GameDNA,
    brief: CreativeBrief,
    frame_label: str,
    overlay_text: str,
) -> None:
    image = Image.new("RGB", (720, 1280), _hex_to_rgb(game_dna.palette.primary_hex))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    secondary = _hex_to_rgb(game_dna.palette.secondary_hex)
    accent = _hex_to_rgb(game_dna.palette.accent_hex)

    draw.rectangle((40, 60, 680, 340), fill=secondary)
    draw.rounded_rectangle((60, 420, 660, 1020), radius=40, fill=(255, 255, 255))
    draw.ellipse((500, 100, 670, 270), fill=accent)

    title_lines = textwrap.fill(brief.title, width=22)
    overlay_lines = textwrap.fill(overlay_text, width=22)
    direction_lines = textwrap.fill(frame_label, width=26)

    draw.multiline_text((80, 100), title_lines, fill=(20, 20, 20), font=font, spacing=6)
    draw.multiline_text((110, 500), overlay_lines, fill=(20, 20, 20), font=font, spacing=6)
    draw.multiline_text((110, 650), direction_lines, fill=(50, 50, 50), font=font, spacing=6)
    draw.multiline_text(
        (110, 900),
        textwrap.fill(brief.cta, width=18),
        fill=accent,
        font=font,
        spacing=6,
    )

    ensure_dir(path.parent)
    image.save(path)


def generate_variants(
    game_dna: GameDNA,
    briefs: list[CreativeBrief],
    priority_scores: dict[str, float],
    output_dir: Path,
) -> list[GeneratedVariant]:
    """Generate local placeholder hero and storyboard frames for each brief."""
    ensure_dir(output_dir)
    variants: list[GeneratedVariant] = []

    ranked_briefs = sorted(
        briefs,
        key=lambda brief: priority_scores.get(brief.archetype_id, 0.0),
        reverse=True,
    )

    for priority, brief in enumerate(ranked_briefs, start=1):
        prefix = slugify(f"{game_dna.name}-{brief.archetype_id}")
        hero_path = output_dir / f"{prefix}-hero.png"
        board_1_path = output_dir / f"{prefix}-story-1.png"
        board_2_path = output_dir / f"{prefix}-story-2.png"

        _render_asset(
            hero_path,
            game_dna,
            brief,
            "Hero frame: strongest opening beat",
            brief.text_overlays[0],
        )
        _render_asset(
            board_1_path,
            game_dna,
            brief,
            "Storyboard frame: mid-ad product payoff",
            brief.text_overlays[1],
        )
        _render_asset(
            board_2_path,
            game_dna,
            brief,
            "Storyboard frame: close on the CTA",
            brief.cta,
        )

        priority_score = priority_scores.get(brief.archetype_id, 0.0)
        variants.append(
            GeneratedVariant(
                brief=brief,
                hero_frame_path=str(hero_path.resolve()),
                storyboard_paths=[
                    str(board_1_path.resolve()),
                    str(board_2_path.resolve()),
                ],
                test_priority=priority,
                test_priority_rationale=(
                    f"Combined market signal and game-fit score = {priority_score:.2f}"
                ),
            )
        )

    return variants

