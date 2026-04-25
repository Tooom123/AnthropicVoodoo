"""Heuristic Game DNA extraction for the first prototype."""

from __future__ import annotations

from app.cache import slugify
from app.models import AppMetadata, ColorPalette, GameDNA


def _palette_for_game(game_slug: str) -> ColorPalette:
    palettes = {
        "marble-sort": ColorPalette(
            primary_hex="#2EC4B6",
            secondary_hex="#FFBF69",
            accent_hex="#FF6B6B",
            description="bright candy palette with satisfying contrast",
        ),
        "block-jam": ColorPalette(
            primary_hex="#4D96FF",
            secondary_hex="#6BCB77",
            accent_hex="#FFD93D",
            description="clean toy-block palette with readable contrast",
        ),
        "color-merge": ColorPalette(
            primary_hex="#7B61FF",
            secondary_hex="#FF8FAB",
            accent_hex="#F9C74F",
            description="soft gradient palette with transformation energy",
        ),
    }
    return palettes.get(
        game_slug,
        ColorPalette(
            primary_hex="#2D6AEB",
            secondary_hex="#8ECAE6",
            accent_hex="#FFB703",
            description="generic bright mobile-puzzle palette",
        ),
    )


def extract_game_dna(app_metadata: AppMetadata) -> GameDNA:
    """Produce a structured Game DNA from fixture metadata."""
    game_slug = slugify(app_metadata.name)
    palette = _palette_for_game(game_slug)

    profiles = {
        "marble-sort": {
            "sub_genre": "tube-sort",
            "core_loop": "Sort colored marbles into matching tubes and clear clutter.",
            "audience_proxy": "casual puzzle players seeking satisfying cleanup loops",
            "visual_style": "cartoon 2D with glossy marbles",
            "key_mechanics": ["sorting", "color-matching", "cleanup"],
            "character_present": False,
            "ui_mood": "calm/satisfying",
            "signals": [
                "rounded containers and glossy pieces",
                "high color separation for instant readability",
                "board transitions emphasize cleanup and completion",
            ],
        },
        "block-jam": {
            "sub_genre": "block-puzzle",
            "core_loop": "Slide chunky blocks, trigger combos, and free blocked spaces.",
            "audience_proxy": "mass-market puzzle players who enjoy visible mastery",
            "visual_style": "chunky toy-like 3D blocks",
            "key_mechanics": ["sliding", "combo-building", "space-management"],
            "character_present": False,
            "ui_mood": "energetic/competitive",
            "signals": [
                "thick outlined blocks built for readability",
                "combo moments act as the main reward beat",
                "the board looks crowded until the player unlocks space",
            ],
        },
        "color-merge": {
            "sub_genre": "merge-puzzle",
            "core_loop": "Merge matching pieces to unlock larger shapes and stronger colors.",
            "audience_proxy": "cozy casual players who respond to visual transformation",
            "visual_style": "soft gradient 2D with high polish",
            "key_mechanics": ["merging", "upgrading", "transformation"],
            "character_present": False,
            "ui_mood": "cozy/relaxing",
            "signals": [
                "before-and-after transformations are the main payoff",
                "soft gradients support a premium relaxed feeling",
                "the board invites chaining and visual evolution",
            ],
        },
    }

    profile = profiles.get(
        game_slug,
        {
            "sub_genre": "puzzle",
            "core_loop": "Solve short puzzle boards through clear visual interactions.",
            "audience_proxy": "casual mobile players who value quick readable sessions",
            "visual_style": "bright readable mobile puzzle UI",
            "key_mechanics": ["sorting", "matching", "cleanup"],
            "character_present": False,
            "ui_mood": "calm/satisfying",
            "signals": [
                "clear iconography and readable board states",
                "short sessions with visible progress",
                "reward beats come from removing clutter",
            ],
        },
    )

    return GameDNA(
        app_id=app_metadata.app_id,
        name=app_metadata.name,
        genre="puzzle",
        sub_genre=profile["sub_genre"],
        core_loop=profile["core_loop"],
        audience_proxy=profile["audience_proxy"],
        visual_style=profile["visual_style"],
        palette=palette,
        key_mechanics=profile["key_mechanics"],
        character_present=profile["character_present"],
        ui_mood=profile["ui_mood"],
        screenshot_signals=profile["signals"],
    )

