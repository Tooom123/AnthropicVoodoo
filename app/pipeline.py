"""End-to-end HookLens pipeline orchestrator.

Wires every workstream's module into a single ``run_pipeline`` function and
calls a user-supplied ``on_step`` callback after each step so callers (the
Streamlit app, scripts/precache.py, etc.) can show progress in real time.

If you want a streaming generator instead of a callback, wrap this in
``run_pipeline_streaming`` below (yields the same payloads).
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator

from app._paths import CACHE_DIR
from app.analysis.archetypes import compute_archetypes
from app.analysis.deconstruct import deconstruct_batch
from app.analysis.game_dna import extract_game_dna
from app.analysis.game_fit import score_all
from app.creative.brief import author_briefs
from app.creative.scenario import generate_variants
from app.models import (
    AppMetadata,
    CreativeArchetype,
    CreativeBrief,
    DeconstructedCreative,
    GameDNA,
    GameFitScore,
    GeneratedVariant,
    HookLensReport,
    MarketContext,
    RawCreative,
)
from app.sources.sensortower import (
    fetch_top_advertisers,
    fetch_top_creatives,
    resolve_game,
)

log = logging.getLogger(__name__)

REPORT_CACHE_DIR = CACHE_DIR / "reports"


# ---------------------------------------------------------------------------
# Config & state
# ---------------------------------------------------------------------------


@dataclass
class PipelineConfig:
    game_name: str
    country: str = "US"
    network: str = "TikTok"
    category_id: int = 7012  # iOS Puzzle (see docs/sensortower-api.md §9.1)
    period: str = "month"  # week | month | quarter
    period_date: str = "2026-04-01"
    max_top_advertisers: int = 10
    max_creatives: int = 8
    deconstruct_concurrency: int = 5
    top_k_archetypes: int = 5
    top_k_variants: int = 3


@dataclass
class PrototypeInput:
    """Inputs for the 'unreleased game' use case.

    Replaces SensorTower steps 1-2: instead of looking up an existing app, we
    build a synthetic AppMetadata from PM-provided assets. Pipeline steps 3-10
    run identically afterwards.
    """

    name: str
    description: str
    screenshot_paths: list[Path]  # local paths to PM-uploaded mockups/screenshots
    target_category_id: int  # iOS category id for the market scan (e.g. 7012 Puzzle)
    target_audience_proxy: str | None = None  # optional hint, not used yet


@dataclass
class PipelineState:
    config: PipelineConfig
    target_meta: AppMetadata | None = None
    game_dna: GameDNA | None = None
    top_advertisers: list[dict] = field(default_factory=list)
    raw_creatives: list[RawCreative] = field(default_factory=list)
    deconstructed: list[DeconstructedCreative] = field(default_factory=list)
    archetypes: list[CreativeArchetype] = field(default_factory=list)
    top_archetypes: list[CreativeArchetype] = field(default_factory=list)
    fit_scores: list[GameFitScore] = field(default_factory=list)
    chosen: list[tuple[CreativeArchetype, GameFitScore]] = field(default_factory=list)
    briefs: list[CreativeBrief] = field(default_factory=list)
    variants: list[GeneratedVariant] = field(default_factory=list)
    report: HookLensReport | None = None
    step_durations_s: dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Step definitions
# ---------------------------------------------------------------------------


@dataclass
class StepDef:
    step_id: str
    label: str
    runner: Callable[[PipelineState], Any]


def _step_resolve_game(state: PipelineState) -> AppMetadata:
    state.target_meta = resolve_game(state.config.game_name, country=state.config.country)
    return state.target_meta


def _step_game_dna(state: PipelineState) -> GameDNA:
    assert state.target_meta is not None
    state.game_dna = extract_game_dna(state.target_meta)
    return state.game_dna


def _step_top_advertisers(state: PipelineState) -> list[dict]:
    state.top_advertisers = fetch_top_advertisers(
        category_id=state.config.category_id,
        country=state.config.country,
        period=state.config.period,
        period_date=state.config.period_date,
        limit=state.config.max_top_advertisers,
    )
    return state.top_advertisers


def _step_top_creatives(state: PipelineState) -> list[RawCreative]:
    state.raw_creatives = fetch_top_creatives(
        category_id=state.config.category_id,
        country=state.config.country,
        network=state.config.network,
        period=state.config.period,
        period_date=state.config.period_date,
        max_creatives=state.config.max_creatives,
    )
    return state.raw_creatives


def _step_deconstruct(state: PipelineState) -> list[DeconstructedCreative]:
    if not state.raw_creatives:
        log.warning("No raw creatives to deconstruct.")
        return []
    results = asyncio.run(
        deconstruct_batch(
            state.raw_creatives,
            concurrency=state.config.deconstruct_concurrency,
        )
    )
    state.deconstructed = [
        r for (r, _lat) in results if isinstance(r, DeconstructedCreative)
    ]
    return state.deconstructed


def _step_archetypes(state: PipelineState) -> list[CreativeArchetype]:
    state.archetypes = compute_archetypes(state.deconstructed)
    state.top_archetypes = state.archetypes[: state.config.top_k_archetypes]
    return state.top_archetypes


def _step_game_fit(state: PipelineState) -> list[GameFitScore]:
    assert state.game_dna is not None
    state.fit_scores = score_all(state.top_archetypes, state.game_dna)
    ranked = sorted(
        zip(state.top_archetypes, state.fit_scores, strict=True),
        key=lambda x: x[1].overall,
        reverse=True,
    )
    state.chosen = ranked[: state.config.top_k_variants]
    return state.fit_scores


def _step_briefs(state: PipelineState) -> list[CreativeBrief]:
    assert state.game_dna is not None
    state.briefs = author_briefs(state.chosen, state.game_dna)
    return state.briefs


def _step_visuals(state: PipelineState) -> list[GeneratedVariant]:
    state.variants = generate_variants(state.chosen, state.briefs)
    return state.variants


def _step_compose_report(state: PipelineState) -> HookLensReport:
    assert state.game_dna is not None

    period_dt = datetime.fromisoformat(state.config.period_date).replace(
        tzinfo=timezone.utc
    )

    state.report = HookLensReport(
        target_game=state.game_dna,
        market_context=MarketContext(
            category_id=str(state.config.category_id),
            category_name="Puzzle" if state.config.category_id == 7012 else "Other",
            countries=[state.config.country],
            networks=[state.config.network],
            period_start=period_dt,
            period_end=period_dt,
            num_advertisers_scanned=len(state.top_advertisers),
            num_creatives_analyzed=len(state.deconstructed),
            num_phashion_groups=len(
                {d.raw.phashion_group for d in state.deconstructed if d.raw.phashion_group}
            ),
        ),
        top_archetypes=state.top_archetypes,
        game_fit_scores=state.fit_scores,
        final_variants=state.variants,
        pipeline_duration_seconds=sum(state.step_durations_s.values()),
        total_cost_usd=sum(
            d.deconstruction_cost_usd or 0 for d in state.deconstructed
        ),
        generated_at=datetime.now(timezone.utc),
    )

    REPORT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORT_CACHE_DIR / f"{state.game_dna.app_id}_e2e.json"
    out_path.write_text(state.report.model_dump_json(indent=2))
    log.info("HookLensReport saved → %s", out_path)

    return state.report


# Order matters — each step depends on previous state.
STEPS: list[StepDef] = [
    StepDef("target_meta", "Resolve target game", _step_resolve_game),
    StepDef("game_dna", "Extract Game DNA", _step_game_dna),
    StepDef("top_advertisers", "Discover top advertisers", _step_top_advertisers),
    StepDef("raw_creatives", "Pull top creatives", _step_top_creatives),
    StepDef("deconstructed", "Deconstruct videos (Gemini Pro)", _step_deconstruct),
    StepDef("archetypes", "Cluster archetypes + signals", _step_archetypes),
    StepDef("fit_scores", "Score game-fit (Opus)", _step_game_fit),
    StepDef("briefs", "Author creative briefs (Opus)", _step_briefs),
    StepDef("variants", "Generate visuals (Scenario)", _step_visuals),
    StepDef("report", "Compose final report", _step_compose_report),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def run_pipeline(
    config: PipelineConfig,
    *,
    on_step: Callable[[str, str, int, Any, float], None] | None = None,
) -> HookLensReport:
    """Run the full pipeline. Calls ``on_step(step_id, label, idx, payload, duration_s)``
    after each step completes so the caller can render progress.
    """
    state = PipelineState(config=config)

    for idx, step in enumerate(STEPS, start=1):
        log.info("Step %d/%d · %s", idx, len(STEPS), step.label)
        t0 = time.perf_counter()
        try:
            payload = step.runner(state)
        except Exception:
            log.exception("Step %s failed", step.step_id)
            raise
        elapsed = time.perf_counter() - t0
        state.step_durations_s[step.step_id] = elapsed

        if on_step is not None:
            on_step(step.step_id, step.label, idx, payload, elapsed)

    assert state.report is not None
    return state.report


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_") or "proto"


def run_pipeline_prototype(
    proto: PrototypeInput,
    config: PipelineConfig,
    *,
    on_step: Callable[[str, str, int, Any, float], None] | None = None,
) -> HookLensReport:
    """Run the pipeline on an unreleased game prototype.

    Skips SensorTower steps 1-2 (no app to resolve) and instead synthesizes
    an ``AppMetadata`` from PM inputs. Steps 3-10 run unchanged.

    The PM-uploaded screenshots are copied into the Game DNA cache directory
    using the canonical naming scheme so ``app.analysis.game_dna.extract_game_dna``
    finds them locally and skips its HTTP download path.
    """
    from app.analysis.game_dna import SCREENSHOT_CACHE_DIR

    if not proto.screenshot_paths:
        raise ValueError("Prototype mode requires at least 1 screenshot.")
    if not proto.description or len(proto.description) < 30:
        raise ValueError(
            "Prototype description must be at least 30 characters — "
            "Gemini Vision needs context to generate a meaningful Game DNA."
        )

    proto_app_id = f"proto_{_slug(proto.name)}"

    # Pre-populate the screenshot cache so extract_game_dna treats this as a
    # cache hit and never calls httpx.
    screenshot_dir = SCREENSHOT_CACHE_DIR / proto_app_id
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    for i, src in enumerate(proto.screenshot_paths):
        target = screenshot_dir / f"{i:02d}.png"
        if (
            not target.exists()
            or target.stat().st_size == 0
            or src.stat().st_mtime > target.stat().st_mtime
        ):
            shutil.copy(src, target)

    # Build a synthetic AppMetadata. We fill screenshot_urls with valid HttpUrl
    # placeholders (Picsum) — the URLs are never hit because the cache files
    # already exist with the canonical names extract_game_dna looks for.
    synthetic_meta = AppMetadata(
        app_id=proto_app_id,
        unified_app_id=None,
        name=proto.name,
        publisher_name="(prototype)",
        icon_url="https://picsum.photos/seed/proto_icon/256",
        categories=[proto.target_category_id],
        description=proto.description,
        screenshot_urls=[
            f"https://picsum.photos/seed/{proto_app_id}_{i}/640/1136"
            for i in range(len(proto.screenshot_paths))
        ],
        rating=None,
        rating_count=None,
    )

    # Force the config category to the prototype's target so step 4 (advertisers)
    # and step 5 (creatives) scan the right segment of the market.
    config.category_id = proto.target_category_id

    state = PipelineState(config=config)
    state.target_meta = synthetic_meta

    # Synthetically yield step 1 (resolve_game) so the UI gets a "Step 1/10
    # done" event with the synthetic metadata payload.
    if on_step is not None:
        on_step("target_meta", "Resolve target game (prototype)", 1, synthetic_meta, 0.0)
    state.step_durations_s["target_meta"] = 0.0

    # Run the rest of the steps starting from step 2 (game_dna).
    remaining = [s for s in STEPS if s.step_id != "target_meta"]
    for offset, step in enumerate(remaining, start=2):
        log.info("Step %d/%d · %s", offset, len(STEPS), step.label)
        t0 = time.perf_counter()
        try:
            payload = step.runner(state)
        except Exception:
            log.exception("Step %s failed", step.step_id)
            raise
        elapsed = time.perf_counter() - t0
        state.step_durations_s[step.step_id] = elapsed
        if on_step is not None:
            on_step(step.step_id, step.label, offset, payload, elapsed)

    assert state.report is not None
    return state.report


def run_pipeline_streaming(config: PipelineConfig) -> Iterator[tuple[str, str, int, Any, float]]:
    """Generator variant — yields ``(step_id, label, idx, payload, duration_s)``.

    Useful for callers that prefer a ``for`` loop over a callback.
    """
    queue: list[tuple[str, str, int, Any, float]] = []

    def _capture(step_id: str, label: str, idx: int, payload: Any, dur: float) -> None:
        queue.append((step_id, label, idx, payload, dur))

    # We run the pipeline synchronously and yield events in order. This is
    # simpler than a true async generator for our 10-step linear pipeline.
    run_pipeline(config, on_step=_capture)
    yield from queue
