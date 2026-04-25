"""HookLens data contract.

This file defines the payloads exchanged between sources, analysis, creative,
and UI layers. Keep this contract stable once workstreams start integrating.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class AppMetadata(BaseModel):
    """Basic target-game metadata used by the pipeline."""

    app_id: str
    unified_app_id: str | None = None
    name: str
    publisher_name: str
    icon_url: HttpUrl
    categories: list[int | str]
    description: str
    screenshot_urls: list[HttpUrl] = Field(default_factory=list)
    rating: float | None = None
    rating_count: int | None = None
    release_date: datetime | None = None


AdType = Literal[
    "video",
    "video-rewarded",
    "video-interstitial",
    "video-other",
    "playable",
    "interactive-playable",
    "interactive-playable-rewarded",
    "image",
    "image-interstitial",
    "image-other",
    "banner",
    "full_screen",
]


class RawCreative(BaseModel):
    """One market creative in raw source form."""

    creative_id: str
    ad_unit_id: str
    app_id: str
    advertiser_name: str
    network: str
    ad_type: AdType
    creative_url: HttpUrl
    thumb_url: HttpUrl | None = None
    preview_url: HttpUrl | None = None
    phashion_group: str | None = None
    share: float | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    video_duration: float | None = None
    aspect_ratio: str | None = None
    width: int | None = None
    height: int | None = None
    message: str | None = None
    button_text: str | None = None
    days_active: int | None = None


class ColorPalette(BaseModel):
    """Three-color palette summary for the game identity."""

    primary_hex: str
    secondary_hex: str
    accent_hex: str
    description: str


class GameDNA(BaseModel):
    """Condensed product and visual identity of the target game."""

    app_id: str
    name: str
    genre: str
    sub_genre: str | None = None
    core_loop: str
    audience_proxy: str
    visual_style: str
    palette: ColorPalette
    key_mechanics: list[str]
    character_present: bool
    ui_mood: str
    screenshot_signals: list[str]


EmotionalPitch = Literal[
    "satisfaction",
    "fail",
    "curiosity",
    "rage_bait",
    "tutorial",
    "asmr",
    "celebrity",
    "challenge",
    "transformation",
    "other",
]


class HookFrame(BaseModel):
    """Summary of the first 3 seconds of a creative."""

    summary: str
    visual_action: str
    text_overlay: str | None = None
    voiceover_transcript: str | None = None
    emotional_pitch: EmotionalPitch


class DeconstructedCreative(BaseModel):
    """Structured creative analysis derived from a raw creative."""

    raw: RawCreative
    hook: HookFrame
    scene_flow: list[str]
    on_screen_text: list[str]
    cta_text: str | None = None
    cta_timing_seconds: float | None = None
    palette_hex: list[str]
    visual_style: str
    audience_proxy: str
    deconstruction_model: str = "heuristic-fixture-v1"
    deconstruction_cost_usd: float | None = None


class CreativeArchetype(BaseModel):
    """A cluster of creatives that share the same market hook pattern."""

    archetype_id: str
    label: str
    member_creative_ids: list[str]
    centroid_hook: HookFrame
    palette_hex: list[str]
    common_mechanics: list[str]
    velocity_score: float
    derivative_spread: float
    freshness_days: float
    overall_signal_score: float
    rationale: str


class GameFitScore(BaseModel):
    """How strongly an archetype matches the target game."""

    archetype_id: str
    visual_match: int
    mechanic_match: int
    audience_match: int
    overall: int
    rationale: str


class CreativeBrief(BaseModel):
    """Structured creative brief that downstream image generation consumes."""

    archetype_id: str
    target_game_id: str
    title: str
    hook_3s: str
    scene_flow: list[str]
    visual_direction: str
    text_overlays: list[str]
    cta: str
    rationale: str
    scenario_prompts: list[str]


class GeneratedVariant(BaseModel):
    """Generated output for one prioritized creative direction."""

    brief: CreativeBrief
    hero_frame_path: str
    storyboard_paths: list[str]
    test_priority: int
    test_priority_rationale: str


class MarketContext(BaseModel):
    """Summary of the market slice that was analyzed."""

    category_id: str
    category_name: str
    countries: list[str]
    networks: list[str]
    period_start: datetime
    period_end: datetime
    num_advertisers_scanned: int
    num_creatives_analyzed: int
    num_phashion_groups: int


class HookLensReport(BaseModel):
    """Top-level report rendered by the UI."""

    target_game: GameDNA
    market_context: MarketContext
    top_archetypes: list[CreativeArchetype]
    game_fit_scores: list[GameFitScore]
    final_variants: list[GeneratedVariant]
    pipeline_duration_seconds: float
    total_cost_usd: float
    generated_at: datetime
