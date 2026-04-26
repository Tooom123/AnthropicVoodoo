"""HookLens API bridge — exposes SensorTower metrics + full HookLens reports
to the React frontend.

Run:
    uv run uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()
log = logging.getLogger(__name__)

# Silence httpx INFO-level URL logging — SensorTower URLs include the
# auth_token query param, which would otherwise leak into shipping logs every
# time a cache miss hits the API. Library-level sanitisation is brittle, so
# we just raise httpx's logger threshold; warnings + errors still surface.
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="HookLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Response shapes (mirror front/src/data/sample.ts)
# ---------------------------------------------------------------------------

NetworkFE = Literal["Meta", "Google", "TikTok", "ironSource"]
FormatFE = Literal["Video", "Static", "Playable"]
SpendTierFE = Literal["Micro", "Mid", "Top"]


class Creative(BaseModel):
    id: str
    game: str
    network: NetworkFE
    format: FormatFE
    runDays: int
    """Estimated impressions — REMOVED. Was a fake = max(10k, share*50M) value;
    the frontend hides it. Kept on the model for backwards compat with the
    React UI's typed shapes; treat as advisory only.
    """
    impressions: int
    score: int
    spendEstimate: int
    startedAt: str
    thumbUrl: str | None = None
    creativeUrl: str | None = None
    # Real SensorTower fields exposed for honest display in Ad Library:
    sov: float | None = None
    """Share of Voice within the queried category × network × period
    (0.0–1.0). The ONLY trustworthy "popularity" metric we have direct
    from SensorTower; everything else (impressions, spendEstimate, score)
    is a synthetic tier we synthesised earlier and should not be shown
    as a numeric KPI to PMs.
    """
    publisherName: str | None = None
    """The advertiser's app publisher (from SensorTower app_info.publisher_name).
    Lets the UI show "Voodoo • aquapark.io" instead of just the game name.
    """
    appIconUrl: str | None = None
    """The advertiser's app icon URL (from SensorTower app_info.icon_url)."""


class CompetitorGame(BaseModel):
    game: str
    subGenre: str
    appStoreRank: int
    monthlySpend: int
    spendTier: SpendTierFE
    status: Literal["Active", "Monitoring"]
    # SensorTower app id (unified when available) — used by the frontend to
    # fetch network ranks via /api/advertisers/{app_id}/ranks. Optional so the
    # current sample.ts CompetitorGame stays compatible.
    app_id: str | None = None


# ---------------------------------------------------------------------------
# Network mapping: SensorTower → frontend labels
# ---------------------------------------------------------------------------

_ST_TO_FE: dict[str, NetworkFE] = {
    "facebook": "Meta",
    "meta": "Meta",
    "instagram": "Meta",
    "google": "Google",
    "google uac": "Google",
    "tiktok": "TikTok",
    "ironsource": "ironSource",
    "iron source": "ironSource",
}

# Networks we query, paired with their SensorTower slug
_NETWORKS: list[tuple[str, NetworkFE]] = [
    ("Facebook", "Meta"),
    ("Google", "Google"),
    ("TikTok", "TikTok"),
    ("ironSource", "ironSource"),
]


def _norm_network(raw: str) -> NetworkFE:
    return _ST_TO_FE.get(raw.lower(), "Meta")


def _norm_format(ad_type: str) -> FormatFE:
    t = ad_type.lower()
    if "playable" in t:
        return "Playable"
    if "image" in t or "banner" in t or "static" in t:
        return "Static"
    return "Video"


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------

_MARKET_TOTAL_IMPRESSIONS = 50_000_000


# iOS App Store game category IDs (from docs/sensortower-api.md §9.1).
# 6014 = Games root, 7001–7019 = sub-genres. Used to filter out
# non-game advertisers (Papa Murphy's, Burger King, etc.) that
# SensorTower's category filter sometimes leaks through when the
# advertiser app has ``categories: null``.
_IOS_GAME_CATEGORY_IDS: set[int] = {
    6014, 7001, 7002, 7003, 7004, 7005, 7006, 7009, 7011, 7012,
    7013, 7014, 7015, 7016, 7017, 7018, 7019,
}


def _is_game_advertiser(categories: list[Any] | None) -> bool:
    """True iff the app declares any iOS Game category. Conservative:
    when categories is missing or empty, return False so we exclude
    rather than risk surfacing a pizzeria ad in the gaming Ad Library.
    """
    for cat in categories or []:
        try:
            if int(cat) in _IOS_GAME_CATEGORY_IDS:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _index_sensortower_app_info() -> dict[str, dict[str, Any]]:
    """Build a creative_id → {publisher_name, icon_url, advertiser_name,
    categories, is_game} index by scanning every cached SensorTower
    ``creatives_top_*.json`` on disk. Cheap (10-30 small files for the
    whole demo cache).

    Used to enrich ``/api/creatives`` responses with real publisher /
    icon data that ``fetch_top_creatives`` flattens away into the
    ``RawCreative`` shape, AND to filter out non-game advertisers in
    the AdLibrary.
    """
    st_cache = CACHE_DIR / "sensortower"
    out: dict[str, dict[str, Any]] = {}
    if not st_cache.exists():
        return out
    for path in st_cache.glob("creatives_top_*.json"):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for au in data.get("ad_units") or []:
            info = au.get("app_info") or {}
            categories = info.get("categories")
            for c in au.get("creatives") or []:
                cid = str(c.get("id") or "")
                if not cid or cid in out:
                    continue
                out[cid] = {
                    "publisher_name": info.get("publisher_name"),
                    "icon_url": info.get("icon_url"),
                    "advertiser_name": info.get("name"),
                    "categories": categories,
                    "is_game": _is_game_advertiser(categories),
                }
    return out


def _raw_to_creative(rc, *, app_info_index: dict[str, dict[str, Any]] | None = None) -> Creative:
    from app.models import RawCreative  # local import to avoid startup overhead

    assert isinstance(rc, RawCreative)

    first = rc.first_seen_at
    last = rc.last_seen_at
    run_days = max(0, (last - first).days)

    share = rc.share or 0.0
    # Synthetic tiers (kept for back-compat; the React UI no longer renders
    # them as KPIs because they're hardcoded floors, not real signal).
    impressions = max(10_000, int(share * _MARKET_TOTAL_IMPRESSIONS))
    score = min(100, max(1, int(share * 1_200)))
    spend = max(1_000, int(impressions * 0.04))

    extra = (app_info_index or {}).get(rc.creative_id) or {}

    return Creative(
        id=rc.creative_id,
        game=rc.advertiser_name,
        network=_norm_network(rc.network),
        format=_norm_format(rc.ad_type),
        runDays=run_days,
        impressions=impressions,
        score=score,
        spendEstimate=spend,
        startedAt=first.date().isoformat(),
        thumbUrl=str(rc.thumb_url) if rc.thumb_url else None,
        creativeUrl=str(rc.creative_url),
        sov=share if share > 0 else None,
        publisherName=extra.get("publisher_name"),
        appIconUrl=extra.get("icon_url"),
    )


def _advertiser_to_competitor(adv: dict, rank: int) -> CompetitorGame:
    sov: float = adv.get("sov") or adv.get("share") or 0.0
    monthly_spend = max(50_000, int(sov * 8_000_000))
    if sov > 0.08:
        tier: SpendTierFE = "Top"
    elif sov > 0.025:
        tier = "Mid"
    else:
        tier = "Micro"

    raw_app_id = (
        adv.get("app_id")
        or adv.get("unified_app_id")
        or adv.get("entity_id")
    )
    return CompetitorGame(
        game=adv.get("name") or adv.get("app_name") or "Unknown",
        subGenre="Puzzle",
        appStoreRank=rank,
        monthlySpend=monthly_spend,
        spendTier=tier,
        status="Active",
        app_id=str(raw_app_id) if raw_app_id else None,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

DEFAULT_DATE = date.today().replace(day=1).isoformat()


# ---------------------------------------------------------------------------
# Game resolution helper
# ---------------------------------------------------------------------------

class GameMeta(BaseModel):
    name: str
    publisher: str
    app_id: str
    icon_url: str
    description: str


def _resolve_category(game_name: str, default: int) -> tuple[int, GameMeta | None]:
    """Resolve game → AppMetadata, return (category_id, GameMeta).

    Uses the first integer category from the app's metadata when available,
    otherwise keeps the caller-supplied default.
    """
    from app.sources.sensortower import resolve_game

    try:
        meta = resolve_game(game_name)
        cat_id = default
        for cat in meta.categories:
            if isinstance(cat, int) and cat > 0:
                cat_id = cat
                break
        game_meta = GameMeta(
            name=meta.name,
            publisher=meta.publisher_name,
            app_id=meta.app_id,
            icon_url=str(meta.icon_url),
            description=meta.description[:200],
        )
        return cat_id, game_meta
    except Exception:
        log.exception("resolve_game failed for %r", game_name)
        return default, None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/game", response_model=GameMeta | None)
def get_game(name: str = Query(...)):
    """Resolve a game name via SensorTower and return its metadata."""
    _, meta = _resolve_category(name, 7012)
    return meta


# Curated worldwide expansion for the AdLibrary's "All" Region option.
# Mirrors app/pipeline.py ALL_COUNTRIES — keep them in sync.
_AD_LIBRARY_ALL_COUNTRIES = ["US", "GB", "DE", "FR", "JP", "BR", "KR"]


@app.get("/api/creatives", response_model=list[Creative])
def get_creatives(
    game_name: str | None = Query(None),
    category_id: int = Query(7012),
    country: str = Query(
        "US",
        description="Country code, or 'all' to fan out across the curated worldwide list",
    ),
    period: str = Query("month"),
    period_date: str = Query(DEFAULT_DATE),
    limit: int = Query(60, ge=1, le=120),
):
    """Return top ad creatives across all networks, shaped for the frontend.

    When ``game_name`` is supplied, SensorTower resolves it first and uses its
    category to scope the ad-intel query.

    When ``country='all'``, fans out across the curated worldwide list
    (US/GB/DE/FR/JP/BR/KR) and dedupes by ``creative_id`` — the AdLibrary's
    Region filter offers this as the implicit default for showing the
    broadest global trend slice.

    Each row is enriched with the advertiser's ``publisher_name`` and
    ``icon_url`` (from the cached SensorTower app_info payload), so the
    Ad Library UI can render the publisher/game pair instead of just an
    opaque advertiser name. Synthetic ``impressions`` / ``score`` /
    ``spendEstimate`` are still in the schema for back-compat but the
    React UI no longer renders them as numbers — only ``sov`` (real Share
    of Voice from SensorTower) is shown as a quantitative chip.
    """
    from app.sources.sensortower import fetch_top_creatives

    if game_name:
        category_id, _ = _resolve_category(game_name, category_id)

    countries = (
        _AD_LIBRARY_ALL_COUNTRIES
        if country.strip().lower() == "all"
        else [country]
    )
    per_network = max(1, limit // (len(_NETWORKS) * len(countries)))

    seen_ids: set[str] = set()
    results: list[Creative] = []
    app_info_index = _index_sensortower_app_info()

    for ctry in countries:
        for st_network, fe_network in _NETWORKS:
            try:
                raws = fetch_top_creatives(
                    category_id=category_id,
                    country=ctry,
                    network=st_network,
                    period=period,
                    period_date=period_date,
                    max_creatives=max(per_network, 4),
                )
            except Exception:
                log.exception(
                    "fetch_top_creatives failed for %s × %s", st_network, ctry
                )
                continue
            for rc in raws:
                if rc.creative_id in seen_ids:
                    continue
                seen_ids.add(rc.creative_id)
                # Skip non-game advertisers (Papa Murphy's, Burger King…)
                # that SensorTower's category filter sometimes leaks
                # through when the advertiser's app_info has
                # categories=null.
                extra = app_info_index.get(rc.creative_id) or {}
                if extra and extra.get("is_game") is False:
                    continue
                c = _raw_to_creative(rc, app_info_index=app_info_index)
                results.append(c.model_copy(update={"network": fe_network}))
                if len(results) >= limit:
                    return results

    return results


@app.get("/api/advertisers", response_model=list[CompetitorGame])
def get_advertisers(
    game_name: str | None = Query(None),
    category_id: int = Query(7012),
    country: str = Query("US"),
    period: str = Query("month"),
    period_date: str = Query(DEFAULT_DATE),
    limit: int = Query(10, ge=1, le=50),
):
    """Return top advertisers (competitors) shaped for the frontend.

    When ``game_name`` is supplied, uses its category to scope the query.
    """
    from app.sources.sensortower import fetch_top_advertisers

    if game_name:
        category_id, _ = _resolve_category(game_name, category_id)

    try:
        advs = fetch_top_advertisers(
            category_id=category_id,
            country=country,
            period=period,
            period_date=period_date,
            limit=limit,
        )
    except Exception:
        log.exception("fetch_top_advertisers failed")
        return []

    return [_advertiser_to_competitor(adv, rank=i + 1) for i, adv in enumerate(advs)]


@app.get("/health")
def health():
    return {"status": "ok", "utc": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Full HookLens report endpoints — the actual product surface
# ---------------------------------------------------------------------------

from app._paths import CACHE_DIR  # noqa: E402

REPORTS_CACHE_DIR = CACHE_DIR / "reports"


class ReportSummary(BaseModel):
    """One row in /api/reports — a cached run available for instant display."""

    app_id: str
    name: str
    publisher: str | None = None
    icon_url: str | None = None
    generated_at: str | None = None
    num_archetypes: int
    num_variants: int
    total_cost_usd: float
    duration_seconds: float


@app.get("/api/reports", response_model=list[ReportSummary])
def list_reports() -> list[ReportSummary]:
    """List all cached HookLensReports available on disk.

    Used by the frontend to populate a "previously analyzed games" picker
    in the sidebar — instant load on click vs running the full pipeline.
    """
    if not REPORTS_CACHE_DIR.exists():
        return []

    out: list[ReportSummary] = []
    for path in sorted(REPORTS_CACHE_DIR.glob("*_e2e.json")):
        try:
            data = json.loads(path.read_text())
            tg = data.get("target_game", {})
            out.append(
                ReportSummary(
                    app_id=tg.get("app_id", path.stem.removesuffix("_e2e")),
                    name=tg.get("name", "Unknown"),
                    publisher=None,
                    icon_url=None,
                    generated_at=data.get("generated_at"),
                    num_archetypes=len(data.get("top_archetypes", [])),
                    num_variants=len(data.get("final_variants", [])),
                    total_cost_usd=float(data.get("total_cost_usd") or 0),
                    duration_seconds=float(data.get("pipeline_duration_seconds") or 0),
                )
            )
        except Exception:
            log.exception("Failed to parse cached report %s", path.name)
            continue
    # Most recent first
    out.sort(key=lambda r: r.generated_at or "", reverse=True)
    return out


class GameScreenshots(BaseModel):
    """App Store screenshots URLs for a target game."""

    app_id: str
    name: str | None = None
    screenshot_urls: list[str] = []


@app.get("/api/game/screenshots", response_model=GameScreenshots)
def get_game_screenshots(
    game_name: str | None = Query(None),
    app_id: str | None = Query(None),
) -> GameScreenshots:
    """Return App Store screenshot URLs cached from SensorTower's iOS app
    metadata. Used by GameDnaCard to surface real gameplay screenshots
    next to the DNA analysis.
    """
    if not (game_name or app_id):
        raise HTTPException(
            status_code=400,
            detail="Provide either ?game_name=... or ?app_id=...",
        )

    resolved_id = app_id
    if not resolved_id and game_name:
        try:
            from app.sources.sensortower import resolve_game

            meta = resolve_game(game_name)
            return GameScreenshots(
                app_id=meta.app_id,
                name=meta.name,
                screenshot_urls=[str(u) for u in meta.screenshot_urls],
            )
        except Exception:
            log.exception("get_game_screenshots: resolve_game failed for %r", game_name)
            return GameScreenshots(app_id="", screenshot_urls=[])

    # Fall back to scanning the SensorTower meta cache for app_id matches.
    st_cache = CACHE_DIR / "sensortower"
    if not st_cache.exists():
        return GameScreenshots(app_id=resolved_id or "", screenshot_urls=[])

    for path in st_cache.glob(f"meta_{resolved_id}_*.json"):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        apps = data.get("apps") or []
        if not apps:
            continue
        meta = apps[0]
        return GameScreenshots(
            app_id=str(meta.get("app_id") or resolved_id or ""),
            name=meta.get("name"),
            screenshot_urls=list(meta.get("screenshot_urls") or []),
        )

    return GameScreenshots(app_id=resolved_id or "", screenshot_urls=[])


class SourceCreative(BaseModel):
    """One source ad creative that was deconstructed into an archetype cluster."""

    creative_id: str
    network: str
    ad_type: str = "video"
    thumb_url: str | None = None
    creative_url: str | None = None
    first_seen_at: str | None = None
    advertiser_name: str | None = None


def _index_sensortower_creatives() -> dict[str, dict[str, Any]]:
    """Build an index of every creative in the SensorTower disk cache,
    keyed by ``creative_id`` → minimal dict with thumb/creative URLs.

    Caches the index in-memory across calls (cheap to rebuild on file mtime
    change since the directory only grows, but for the demo we just rebuild
    on each request — there are ~10-30 files in the cache).
    """
    st_cache = CACHE_DIR / "sensortower"
    out: dict[str, dict[str, Any]] = {}
    if not st_cache.exists():
        return out

    for path in st_cache.glob("creatives_top_*.json"):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for au in data.get("ad_units") or []:
            network = au.get("network") or ""
            ad_type = au.get("ad_type") or "video"
            first_seen = au.get("first_seen_at") or ""
            advertiser = (au.get("app_info") or {}).get("name")
            for c in au.get("creatives") or []:
                cid = str(c.get("id") or "")
                if not cid or cid in out:
                    continue
                out[cid] = {
                    "creative_id": cid,
                    "network": network,
                    "ad_type": ad_type,
                    "thumb_url": c.get("thumb_url"),
                    "creative_url": c.get("creative_url"),
                    "first_seen_at": first_seen[:10] if first_seen else None,
                    "advertiser_name": advertiser,
                }
    return out


@app.get("/api/report/source_creatives")
def get_source_creatives(
    game_name: str | None = Query(None),
    app_id: str | None = Query(None),
) -> dict[str, list[SourceCreative]]:
    """Return the source ad creatives that compose each archetype, keyed by
    ``archetype_id``. Used by the Insights view to surface real ad thumbnails
    inside the ArchetypesTable so the user can SEE the creatives that were
    clustered, not just read about them.

    Strategy: load the cached report, look up every archetype's
    ``member_creative_ids`` against the SensorTower disk cache (the original
    ``ad_units[].creatives[]`` payloads). Returns an empty list per archetype
    when no thumbnail is found (graceful empty-state on the frontend).
    """
    if not (game_name or app_id):
        raise HTTPException(
            status_code=400,
            detail="Provide either ?game_name=... or ?app_id=...",
        )

    resolved_id = app_id
    if not resolved_id and game_name:
        try:
            from app.sources.sensortower import resolve_game

            meta = resolve_game(game_name)
            resolved_id = meta.app_id
        except Exception:
            slug = (game_name or "").lower().replace(" ", "_").replace("-", "_")
            resolved_id = f"proto_{slug}"

    cache_path = REPORTS_CACHE_DIR / f"{resolved_id}_e2e.json"
    if not cache_path.exists():
        return {}

    try:
        report = json.loads(cache_path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}

    creative_index = _index_sensortower_creatives()

    out: dict[str, list[SourceCreative]] = {}
    for arch in report.get("top_archetypes") or []:
        arch_id = str(arch.get("archetype_id") or "")
        if not arch_id:
            continue
        ids = arch.get("member_creative_ids") or []
        thumbs: list[SourceCreative] = []
        for cid in ids:
            entry = creative_index.get(str(cid))
            if entry:
                thumbs.append(SourceCreative.model_validate(entry))
        out[arch_id] = thumbs

    return out


@app.get("/api/report")
def get_report(
    game_name: str | None = Query(None, description="Game name to resolve via SensorTower"),
    app_id: str | None = Query(None, description="Direct app_id (skips SensorTower lookup)"),
) -> dict:
    """Return the full HookLensReport for a game, loaded from disk cache.

    The pipeline is too slow (3-5 minutes) to run synchronously inside an
    HTTP request. We assume reports have been pre-cached by:

        uv run python -m scripts.precache "Marble Sort" "Mob Control" ...

    Returns 404 if no cached report exists for the resolved app_id.
    """
    if not (game_name or app_id):
        raise HTTPException(
            status_code=400,
            detail="Provide either ?game_name=... or ?app_id=...",
        )

    resolved_id = app_id
    if not resolved_id and game_name:
        try:
            from app.sources.sensortower import resolve_game

            meta = resolve_game(game_name)
            resolved_id = meta.app_id
        except Exception:
            log.exception("resolve_game failed for %r", game_name)
            # Fall back to slug-based lookup for prototype reports
            slug = game_name.lower().replace(" ", "_").replace("-", "_")
            resolved_id = f"proto_{slug}"

    cache_path = REPORTS_CACHE_DIR / f"{resolved_id}_e2e.json"
    if not cache_path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "message": f"No cached HookLensReport for {game_name or app_id!r}.",
                "resolved_app_id": resolved_id,
                "hint": (
                    "Run `uv run python -m scripts.precache "
                    f"{game_name!r}` to pre-bake one (3-5 min)."
                ),
            },
        )

    # Return the raw JSON payload — preserves Pydantic schema fidelity for
    # the frontend without forcing FastAPI to re-serialize.
    return json.loads(cache_path.read_text())


# ---------------------------------------------------------------------------
# Live pipeline runner — streams step-by-step progress over Server-Sent Events
# ---------------------------------------------------------------------------

# Total step count is fixed by app.pipeline.STEPS — kept in sync below.
PIPELINE_TOTAL_STEPS = 10


def _summarize_step_payload(step_id: str, payload: Any) -> dict[str, Any]:
    """Produce a small JSON-safe summary of a step's output for SSE clients.

    Avoid streaming the full pydantic objects: they can be 20+ KB each and
    we don't need them client-side until the final report lands on disk.
    """
    if payload is None:
        return {}
    try:
        if step_id == "target_meta":
            return {"name": getattr(payload, "name", None), "app_id": getattr(payload, "app_id", None)}
        if step_id == "game_dna":
            return {
                "name": getattr(payload, "name", None),
                "genre": getattr(payload, "genre", None),
                "primary_hex": getattr(getattr(payload, "palette", None), "primary_hex", None),
            }
        if step_id == "top_advertisers":
            return {"count": len(payload) if hasattr(payload, "__len__") else 0}
        if step_id == "raw_creatives":
            return {"count": len(payload) if hasattr(payload, "__len__") else 0}
        if step_id == "deconstructed":
            return {"count": len(payload) if hasattr(payload, "__len__") else 0}
        if step_id == "archetypes":
            labels = []
            for a in (payload or [])[:5]:
                lab = getattr(a, "label", None)
                if lab:
                    labels.append(lab)
            return {"count": len(payload) if hasattr(payload, "__len__") else 0, "labels": labels}
        if step_id == "fit_scores":
            return {"count": len(payload) if hasattr(payload, "__len__") else 0}
        if step_id == "briefs":
            titles = [getattr(b, "title", None) for b in (payload or [])[:3]]
            return {"count": len(payload) if hasattr(payload, "__len__") else 0, "titles": [t for t in titles if t]}
        if step_id == "variants":
            return {"count": len(payload) if hasattr(payload, "__len__") else 0}
        if step_id == "report":
            return {
                "app_id": getattr(getattr(payload, "target_game", None), "app_id", None),
                "name": getattr(getattr(payload, "target_game", None), "name", None),
                "duration_s": getattr(payload, "pipeline_duration_seconds", None),
                "cost_usd": getattr(payload, "total_cost_usd", None),
            }
    except Exception:
        log.exception("payload summary failed for step %s", step_id)
    return {}


@app.get("/api/report/run/stream")
async def run_report_stream(
    game_name: str = Query(..., description="Game name to analyze"),
    countries: str = Query(
        "all",
        description="Comma-separated country codes, or 'all' for the curated worldwide list",
    ),
    networks: str = Query(
        "all",
        description="Comma-separated networks (TikTok, Facebook, Instagram), or 'all'",
    ),
    period: str = Query("month"),
    period_date: str = Query("2026-04-01"),
    max_creatives: int = Query(8, ge=1, le=20),
    top_k_archetypes: int = Query(5, ge=1, le=10),
    top_k_variants: int = Query(3, ge=1, le=5),
):
    """Run the full HookLens pipeline and stream step-by-step progress as SSE.

    The client opens an EventSource on this URL; we emit one ``data: {...}``
    event after each pipeline step (10 in total) plus a final ``done`` (or
    ``error``) event. Suitable for a live in-app analyze button — the
    pipeline takes 3–5 minutes end-to-end and 1–2 dollars in API calls.
    """
    from app.pipeline import PipelineConfig, run_pipeline

    countries_list = [c.strip() for c in countries.split(",") if c.strip()] or ["all"]
    networks_list = [n.strip() for n in networks.split(",") if n.strip()] or ["all"]

    config = PipelineConfig(
        game_name=game_name,
        countries=countries_list,
        networks=networks_list,
        period=period,
        period_date=period_date,
        max_creatives=max_creatives,
        top_k_archetypes=top_k_archetypes,
        top_k_variants=top_k_variants,
    )

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def on_step(step_id: str, label: str, idx: int, payload: Any, duration_s: float) -> None:
        """Pipeline callback (runs in the executor thread)."""
        event = {
            "type": "step",
            "step_id": step_id,
            "label": label,
            "idx": idx,
            "total": PIPELINE_TOTAL_STEPS,
            "duration_s": round(duration_s, 3),
            "summary": _summarize_step_payload(step_id, payload),
        }
        loop.call_soon_threadsafe(queue.put_nowait, event)

    def _run_blocking() -> dict[str, Any]:
        report = run_pipeline(config, on_step=on_step)
        return {
            "type": "done",
            "app_id": report.target_game.app_id,
            "name": report.target_game.name,
            "duration_s": round(report.pipeline_duration_seconds, 1),
            "cost_usd": round(report.total_cost_usd, 4),
        }

    async def _runner() -> None:
        try:
            done = await loop.run_in_executor(None, _run_blocking)
            await queue.put(done)
        except Exception as exc:
            log.exception("Pipeline run failed for %r", game_name)
            await queue.put({"type": "error", "message": str(exc)})
        finally:
            await queue.put(None)  # sentinel

    asyncio.create_task(_runner())

    async def event_stream():
        # Send an initial 'started' event so the client gets immediate feedback.
        yield (
            "data: "
            + json.dumps(
                {
                    "type": "started",
                    "game_name": game_name,
                    "total": PIPELINE_TOTAL_STEPS,
                    "config": {
                        "countries": countries_list,
                        "networks": networks_list,
                        "max_creatives": max_creatives,
                        "top_k_archetypes": top_k_archetypes,
                        "top_k_variants": top_k_variants,
                    },
                }
            )
            + "\n\n"
        )

        # Heartbeat task: SSE keep-alive every 15 s so proxies don't kill the
        # connection during the long Gemini step.
        async def _heartbeat():
            while True:
                await asyncio.sleep(15)
                await queue.put({"type": "heartbeat", "ts": datetime.now(timezone.utc).isoformat()})

        hb_task = asyncio.create_task(_heartbeat())
        try:
            while True:
                event = await queue.get()
                if event is None:  # sentinel: pipeline finished or errored
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            hb_task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Voodoo catalog endpoints — power the "analyze a Voodoo title" picker
# ---------------------------------------------------------------------------


class VoodooApp(BaseModel):
    """Subset of AppMetadata exposed to the frontend pick-list."""

    app_id: str
    unified_app_id: str | None = None
    name: str
    publisher_name: str
    icon_url: str
    categories: list[int | str]
    description: str = ""
    rating: float | None = None
    rating_count: int | None = None


@app.get("/api/voodoo/apps", response_model=list[VoodooApp])
def list_voodoo_apps(refresh: bool = Query(False)) -> list[VoodooApp]:
    """Return Voodoo's full mobile game catalog from SensorTower.

    Cached on disk for 7 days under ``data/cache/voodoo/catalog.json``.
    Pass ``?refresh=1`` to force a re-fetch. Sorted by ``rating_count``
    desc, so the frontend can show the most popular Voodoo titles first.
    """
    from app.sources.voodoo import fetch_voodoo_catalog

    try:
        catalog = fetch_voodoo_catalog(refresh=refresh)
    except Exception:
        log.exception("fetch_voodoo_catalog failed")
        raise HTTPException(status_code=502, detail="SensorTower lookup failed")

    return [
        VoodooApp(
            app_id=m.app_id,
            unified_app_id=m.unified_app_id,
            name=m.name,
            publisher_name=m.publisher_name,
            icon_url=str(m.icon_url),
            categories=list(m.categories),
            description=(m.description or "")[:300],
            rating=m.rating,
            rating_count=m.rating_count,
        )
        for m in catalog
    ]


class VoodooAdSample(BaseModel):
    """One ad creative running on a Voodoo title (mp4 + thumb + metadata)."""

    creative_id: str
    network: str
    ad_type: str
    thumb_url: str | None = None
    creative_url: str | None = None
    first_seen_at: str | None = None


class VoodooPortfolioEntry(BaseModel):
    """One row in the Voodoo Portfolio page — game + ad activity summary."""

    app_id: str
    unified_app_id: str | None = None
    name: str
    publisher_name: str
    icon_url: str
    categories: list[int | str]
    rating: float | None = None
    rating_count: int | None = None
    description: str = ""
    ads_total: int = 0
    ads_by_network: dict[str, int] = {}
    ads_latest_first_seen: str | None = None
    ads_sample: list[VoodooAdSample] = []
    # UA dependency over a 3-month window (set in scripts/precache_voodoo_ads).
    paid_share: float | None = None
    organic_share: float | None = None
    total_downloads_3mo: int | None = None
    # 30-day daily download totals (sparkline-ready) + week-over-week trend.
    # ``downloads_trend_7d_pct`` is a fraction: -0.12 = −12% w/w (declining).
    # The frontend uses these to flag "needs attention" games on the
    # Voodoo Portfolio page.
    downloads_30d_curve: list[int] = []
    downloads_trend_7d_pct: float | None = None
    # UA dependency split (paid vs organic) over the precache window.
    # All three are optional — None when SensorTower has no
    # downloads_by_sources data for the tenant on that app.
    paid_share: float | None = None
    organic_share: float | None = None
    total_downloads_3mo: int | None = None


class VoodooPortfolioResponse(BaseModel):
    generated_at: str | None = None
    country: str = "US"
    limit: int = 15
    apps: list[VoodooPortfolioEntry] = []


@app.get("/api/voodoo/portfolio", response_model=VoodooPortfolioResponse)
def voodoo_portfolio(limit: int = Query(15, ge=1, le=50)) -> VoodooPortfolioResponse:
    """Return the top-N most-rated Voodoo games + their current ad activity.

    Reads from ``data/cache/voodoo/portfolio_summary.json`` (written by
    ``scripts.precache_voodoo_ads``) for instant load. If the snapshot is
    missing, returns an empty response with a friendly message hint —
    the frontend should prompt the user to run the precache script.

    Designed for the Voodoo Portfolio page where every cell needs to render
    immediately from disk during the demo (no 30s fan-out across 15
    SensorTower calls).
    """
    from app.sources.voodoo import VOODOO_CACHE_DIR

    summary_path = VOODOO_CACHE_DIR / "portfolio_summary.json"
    if not summary_path.exists():
        log.info(
            "voodoo_portfolio: portfolio_summary.json missing — "
            "run `uv run python -m scripts.precache_voodoo_ads` to populate it."
        )
        return VoodooPortfolioResponse()

    try:
        data = json.loads(summary_path.read_text())
    except (json.JSONDecodeError, OSError):
        log.exception("voodoo_portfolio: failed to read portfolio_summary.json")
        return VoodooPortfolioResponse()

    apps = data.get("apps") or []
    return VoodooPortfolioResponse(
        generated_at=data.get("generated_at"),
        country=data.get("country", "US"),
        limit=limit,
        apps=[VoodooPortfolioEntry.model_validate(a) for a in apps[:limit]],
    )


@app.get("/api/voodoo/apps/{app_id}/creatives")
def voodoo_app_creatives(
    app_id: str,
    country: str = Query("US"),
    limit: int = Query(20, ge=1, le=100),
    start_date: str | None = Query(
        None,
        description=(
            "Earliest first_seen_at to include (YYYY-MM-DD). Defaults to "
            "180 days before today, which surfaces a useful active+recent set."
        ),
    ),
):
    """Return ad creatives where Voodoo is the *advertiser* on this app.

    Thin HTTP wrapper around :func:`app.sources.voodoo.fetch_voodoo_app_creatives`.
    The shared helper is also called from the brief-generation step in the
    pipeline so we get a free benchmark of Voodoo's existing rotation.
    """
    from app.sources.voodoo import fetch_voodoo_app_creatives

    return fetch_voodoo_app_creatives(
        app_id, country=country, limit=limit, start_date=start_date
    )


# ---------------------------------------------------------------------------
# Network rank — per-advertiser, per-(network, country) ad-intel rank
# ---------------------------------------------------------------------------


class AdvertiserNetworkRank(BaseModel):
    """Latest network rank for an advertiser app on a single network."""

    country: str
    rank: int
    date: str


@app.get(
    "/api/advertisers/{app_id}/ranks",
    response_model=dict[str, AdvertiserNetworkRank],
)
def get_advertiser_ranks(
    app_id: str,
    countries: str = Query("US"),
    networks: str = Query("Facebook,TikTok,Admob,Applovin"),
    period_date: str = Query("2026-04-01"),
) -> dict[str, AdvertiserNetworkRank]:
    """Return the latest network ranks for an advertiser app, keyed by network.

    Used by the Competitive Scope page to show contextual rank badges next to
    each tracked competitor. Picks the most recent date per network from the
    SensorTower ``/v1/unified/ad_intel/network_analysis/rank`` response.

    Returns ``{}`` when the app has no rank data in the queried window —
    long-tail apps regularly fall outside SensorTower's tracked networks.
    """
    from app.sources.sensortower import fetch_network_rank

    # Use period_date as the start, today as the end, so we always pick up
    # the latest weekly rank without paginating through months of history.
    start = period_date
    end = date.today().isoformat()
    if end < start:
        # Fallback: caller asked for a future period_date — give them the
        # rank from the requested window only.
        end = start

    try:
        rows = fetch_network_rank(
            app_ids=app_id,
            networks=networks,
            countries=countries,
            start_date=start,
            end_date=end,
            period="week",
        )
    except Exception:
        log.exception("fetch_network_rank failed for %r", app_id)
        return {}

    # Pick the most recent row per network (largest date wins).
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        net = row.get("network")
        d = row.get("date") or ""
        rank = row.get("rank")
        if not net or rank is None:
            continue
        prev = latest.get(net)
        if prev is None or (prev.get("date") or "") < d:
            latest[net] = row

    out: dict[str, AdvertiserNetworkRank] = {}
    for net, row in latest.items():
        try:
            out[net] = AdvertiserNetworkRank(
                country=str(row.get("country") or countries.split(",")[0]),
                rank=int(row.get("rank")),
                date=str(row.get("date") or ""),
            )
        except (TypeError, ValueError):
            continue
    return out
