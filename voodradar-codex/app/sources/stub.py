"""Fixture-driven source layer used by the first end-to-end prototype."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.cache import slugify
from app.models import AppMetadata, RawCreative

PUZZLE_CATEGORY = 7012
NOW = datetime.now(timezone.utc)


def _days_ago(days: int) -> datetime:
    return NOW - timedelta(days=days)


def _days_active(first_seen_at: datetime, last_seen_at: datetime) -> int:
    return max((last_seen_at - first_seen_at).days, 0)


GAME_FIXTURES: dict[str, AppMetadata] = {
    "marble-sort": AppMetadata(
        app_id="game_marble_sort",
        unified_app_id="unified_marble_sort",
        name="Marble Sort",
        publisher_name="HookLens Studio",
        icon_url="https://images.example.com/marble-sort/icon.png",
        categories=[PUZZLE_CATEGORY, "game_puzzle"],
        description=(
            "Sort colored marbles into clean tubes, clear visual clutter, and finish "
            "each board with smooth satisfying moves."
        ),
        screenshot_urls=[
            "https://images.example.com/marble-sort/01.png",
            "https://images.example.com/marble-sort/02.png",
            "https://images.example.com/marble-sort/03.png",
        ],
        rating=4.7,
        rating_count=120_000,
        release_date=_days_ago(220),
    ),
    "block-jam": AppMetadata(
        app_id="game_block_jam",
        unified_app_id="unified_block_jam",
        name="Block Jam",
        publisher_name="HookLens Studio",
        icon_url="https://images.example.com/block-jam/icon.png",
        categories=[PUZZLE_CATEGORY, "game_puzzle"],
        description=(
            "Slide chunky blocks, create clean combos, and rescue crowded boards in a "
            "bright fast-paced puzzle loop."
        ),
        screenshot_urls=[
            "https://images.example.com/block-jam/01.png",
            "https://images.example.com/block-jam/02.png",
            "https://images.example.com/block-jam/03.png",
        ],
        rating=4.5,
        rating_count=89_000,
        release_date=_days_ago(160),
    ),
    "color-merge": AppMetadata(
        app_id="game_color_merge",
        unified_app_id="unified_color_merge",
        name="Color Merge",
        publisher_name="HookLens Studio",
        icon_url="https://images.example.com/color-merge/icon.png",
        categories=[PUZZLE_CATEGORY, "game_puzzle"],
        description=(
            "Merge color drops, unlock evolving gradients, and chase transformation "
            "moments across compact puzzle boards."
        ),
        screenshot_urls=[
            "https://images.example.com/color-merge/01.png",
            "https://images.example.com/color-merge/02.png",
            "https://images.example.com/color-merge/03.png",
        ],
        rating=4.6,
        rating_count=74_000,
        release_date=_days_ago(140),
    ),
}


CREATIVE_FIXTURES: list[RawCreative] = [
    RawCreative(
        creative_id="creative_asmr_001",
        ad_unit_id="unit_asmr_001",
        app_id="app_goods_sort_3d",
        advertiser_name="Goods Sort 3D",
        network="TikTok",
        ad_type="video",
        creative_url="https://media.example.com/creative_asmr_001.mp4",
        thumb_url="https://media.example.com/creative_asmr_001.jpg",
        phashion_group="asmr-sort",
        share=0.18,
        first_seen_at=_days_ago(7),
        last_seen_at=_days_ago(1),
        video_duration=12.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Can you clean this shelf in one move?",
        button_text="Play Now",
        days_active=_days_active(_days_ago(7), _days_ago(1)),
    ),
    RawCreative(
        creative_id="creative_asmr_002",
        ad_unit_id="unit_asmr_002",
        app_id="app_color_water_sort",
        advertiser_name="Color Water Sort",
        network="TikTok",
        ad_type="video",
        creative_url="https://media.example.com/creative_asmr_002.mp4",
        thumb_url="https://media.example.com/creative_asmr_002.jpg",
        phashion_group="asmr-sort",
        share=0.16,
        first_seen_at=_days_ago(10),
        last_seen_at=_days_ago(2),
        video_duration=13.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Watch the mess disappear.",
        button_text="Try It",
        days_active=_days_active(_days_ago(10), _days_ago(2)),
    ),
    RawCreative(
        creative_id="creative_asmr_003",
        ad_unit_id="unit_asmr_003",
        app_id="app_royal_sort",
        advertiser_name="Royal Sort",
        network="Instagram",
        ad_type="video",
        creative_url="https://media.example.com/creative_asmr_003.mp4",
        thumb_url="https://media.example.com/creative_asmr_003.jpg",
        phashion_group="asmr-sort",
        share=0.12,
        first_seen_at=_days_ago(14),
        last_seen_at=_days_ago(1),
        video_duration=11.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Satisfying sort challenge.",
        button_text="Install",
        days_active=_days_active(_days_ago(14), _days_ago(1)),
    ),
    RawCreative(
        creative_id="creative_fail_001",
        ad_unit_id="unit_fail_001",
        app_id="app_screw_jam",
        advertiser_name="Screw Jam",
        network="TikTok",
        ad_type="video",
        creative_url="https://media.example.com/creative_fail_001.mp4",
        thumb_url="https://media.example.com/creative_fail_001.jpg",
        phashion_group="fail-rescue",
        share=0.15,
        first_seen_at=_days_ago(22),
        last_seen_at=_days_ago(3),
        video_duration=15.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Only geniuses save the last move.",
        button_text="Solve It",
        days_active=_days_active(_days_ago(22), _days_ago(3)),
    ),
    RawCreative(
        creative_id="creative_fail_002",
        ad_unit_id="unit_fail_002",
        app_id="app_home_pin",
        advertiser_name="Home Pin",
        network="Meta",
        ad_type="video",
        creative_url="https://media.example.com/creative_fail_002.mp4",
        thumb_url="https://media.example.com/creative_fail_002.jpg",
        phashion_group="fail-rescue",
        share=0.11,
        first_seen_at=_days_ago(28),
        last_seen_at=_days_ago(4),
        video_duration=14.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Wrong move. Can you rescue the board?",
        button_text="Fix It",
        days_active=_days_active(_days_ago(28), _days_ago(4)),
    ),
    RawCreative(
        creative_id="creative_fail_003",
        ad_unit_id="unit_fail_003",
        app_id="app_tile_family",
        advertiser_name="Tile Family",
        network="Instagram",
        ad_type="video",
        creative_url="https://media.example.com/creative_fail_003.mp4",
        thumb_url="https://media.example.com/creative_fail_003.jpg",
        phashion_group="fail-rescue",
        share=0.09,
        first_seen_at=_days_ago(31),
        last_seen_at=_days_ago(5),
        video_duration=12.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="One mistake ruins the whole level.",
        button_text="Retry",
        days_active=_days_active(_days_ago(31), _days_ago(5)),
    ),
    RawCreative(
        creative_id="creative_transform_001",
        ad_unit_id="unit_transform_001",
        app_id="app_block_blast",
        advertiser_name="Block Blast",
        network="TikTok",
        ad_type="video",
        creative_url="https://media.example.com/creative_transform_001.mp4",
        thumb_url="https://media.example.com/creative_transform_001.jpg",
        phashion_group="transformation-upgrade",
        share=0.14,
        first_seen_at=_days_ago(5),
        last_seen_at=NOW,
        video_duration=13.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="From empty board to perfect combo.",
        button_text="Start",
        days_active=_days_active(_days_ago(5), NOW),
    ),
    RawCreative(
        creative_id="creative_transform_002",
        ad_unit_id="unit_transform_002",
        app_id="app_triple_match",
        advertiser_name="Triple Match 3D",
        network="Meta",
        ad_type="video",
        creative_url="https://media.example.com/creative_transform_002.mp4",
        thumb_url="https://media.example.com/creative_transform_002.jpg",
        phashion_group="transformation-upgrade",
        share=0.10,
        first_seen_at=_days_ago(8),
        last_seen_at=_days_ago(1),
        video_duration=12.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Watch the whole board upgrade in seconds.",
        button_text="Play",
        days_active=_days_active(_days_ago(8), _days_ago(1)),
    ),
    RawCreative(
        creative_id="creative_transform_003",
        ad_unit_id="unit_transform_003",
        app_id="app_tile_bounty",
        advertiser_name="Tile Bounty",
        network="Instagram",
        ad_type="video",
        creative_url="https://media.example.com/creative_transform_003.mp4",
        thumb_url="https://media.example.com/creative_transform_003.jpg",
        phashion_group="transformation-upgrade",
        share=0.08,
        first_seen_at=_days_ago(9),
        last_seen_at=_days_ago(2),
        video_duration=11.0,
        aspect_ratio="9:16",
        width=720,
        height=1280,
        message="Tiny change, huge visual payoff.",
        button_text="See More",
        days_active=_days_active(_days_ago(9), _days_ago(2)),
    ),
]


def _synthetic_game(game_name: str) -> AppMetadata:
    game_slug = slugify(game_name)
    title = game_name.strip() or "Untitled Puzzle"
    return AppMetadata(
        app_id=f"game_{game_slug}",
        unified_app_id=f"unified_{game_slug}",
        name=title,
        publisher_name="Prototype Studio",
        icon_url=f"https://images.example.com/{game_slug}/icon.png",
        categories=[PUZZLE_CATEGORY, "game_puzzle"],
        description=(
            f"{title} is a bright mobile puzzle game built around quick sessions, "
            "clean feedback, and visible board transformations."
        ),
        screenshot_urls=[
            f"https://images.example.com/{game_slug}/01.png",
            f"https://images.example.com/{game_slug}/02.png",
        ],
        rating=4.4,
        rating_count=10_000,
        release_date=_days_ago(120),
    )


def resolve_target_game(game_name: str) -> AppMetadata:
    """Resolve a target game from the local demo catalog."""
    game_slug = slugify(game_name)
    fixture = GAME_FIXTURES.get(game_slug)
    if fixture is not None:
        return fixture.model_copy(deep=True)
    return _synthetic_game(game_name)


def discover_market_creatives(
    target_game: AppMetadata,
    max_creatives: int,
) -> list[RawCreative]:
    """Return the most relevant fixture creatives for the current prototype."""
    del target_game
    creatives = sorted(
        CREATIVE_FIXTURES,
        key=lambda creative: (creative.share or 0.0, creative.first_seen_at),
        reverse=True,
    )
    return [creative.model_copy(deep=True) for creative in creatives[:max_creatives]]

