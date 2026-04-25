"""Top-level HookLens pipeline orchestration."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.analysis import (
    compute_archetypes,
    deconstruct_creatives,
    extract_game_dna,
    score_game_fit,
)
from app.cache import ensure_dir, read_model, slugify, write_model
from app.config import load_settings
from app.creative import generate_briefs, generate_variants
from app.models import HookLensReport, MarketContext
from app.sources import discover_market_creatives, resolve_target_game

log = logging.getLogger(__name__)


def _report_path(cache_dir: Path, game_name: str) -> Path:
    return cache_dir / "reports" / f"{slugify(game_name)}.json"


def _persist_intermediates(
    cache_dir: Path,
    game_slug: str,
    game_dna,
    deconstructed,
) -> None:
    write_model(cache_dir / "game_dna" / f"{game_slug}.json", game_dna)
    for creative in deconstructed:
        write_model(
            cache_dir / "deconstruct" / f"{creative.raw.creative_id}.json",
            creative,
        )


def run_pipeline(game_name: str, cached: bool = False) -> HookLensReport:
    """Run the full HookLens prototype pipeline for one target game."""
    settings = load_settings()
    cache_dir = ensure_dir(settings.cache_dir)
    report_path = _report_path(cache_dir, game_name)

    if cached and report_path.exists():
        log.info("CACHE HIT for report %s", report_path.name)
        return read_model(report_path, HookLensReport)

    t0 = time.perf_counter()
    target_game = resolve_target_game(game_name)
    game_slug = slugify(target_game.name)
    raw_creatives = discover_market_creatives(target_game, settings.max_creatives)
    game_dna = extract_game_dna(target_game)
    deconstructed = deconstruct_creatives(raw_creatives)
    archetypes = compute_archetypes(deconstructed)
    fit_scores = score_game_fit(game_dna, archetypes)

    fit_index = {score.archetype_id: score for score in fit_scores}
    ranked_pairs: list[tuple[object, object, float]] = []
    for archetype in archetypes:
        fit_score = fit_index[archetype.archetype_id]
        priority_score = archetype.overall_signal_score * (fit_score.overall / 100)
        ranked_pairs.append((archetype, fit_score, priority_score))

    ranked_pairs.sort(key=lambda item: item[2], reverse=True)
    selected_pairs = ranked_pairs[:3]

    briefs = generate_briefs(game_dna, selected_pairs)
    priority_scores = {
        archetype.archetype_id: priority_score
        for archetype, _fit_score, priority_score in selected_pairs
    }
    variants = generate_variants(
        game_dna=game_dna,
        briefs=briefs,
        priority_scores=priority_scores,
        output_dir=cache_dir / "generated_assets" / game_slug,
    )

    _persist_intermediates(
        cache_dir=cache_dir,
        game_slug=game_slug,
        game_dna=game_dna,
        deconstructed=deconstructed,
    )

    unique_advertisers = {creative.advertiser_name for creative in raw_creatives}
    period_end = datetime.now(timezone.utc)
    report = HookLensReport(
        target_game=game_dna,
        market_context=MarketContext(
            category_id="7012",
            category_name="Puzzle",
            countries=["US"],
            networks=sorted({creative.network for creative in raw_creatives}),
            period_start=period_end - timedelta(days=30),
            period_end=period_end,
            num_advertisers_scanned=len(unique_advertisers),
            num_creatives_analyzed=len(deconstructed),
            num_phashion_groups=len(
                {
                    creative.raw.phashion_group
                    for creative in deconstructed
                    if creative.raw.phashion_group
                }
            ),
        ),
        top_archetypes=archetypes[:5],
        game_fit_scores=fit_scores,
        final_variants=variants,
        pipeline_duration_seconds=round(time.perf_counter() - t0, 2),
        total_cost_usd=0.0,
        generated_at=period_end,
    )

    write_model(report_path, report)
    log.info("Saved report to %s", report_path)
    return report

