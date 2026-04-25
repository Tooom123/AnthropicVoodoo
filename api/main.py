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
    impressions: int
    score: int
    spendEstimate: int
    startedAt: str
    thumbUrl: str | None = None
    creativeUrl: str | None = None


class CompetitorGame(BaseModel):
    game: str
    subGenre: str
    appStoreRank: int
    monthlySpend: int
    spendTier: SpendTierFE
    status: Literal["Active", "Monitoring"]


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


def _raw_to_creative(rc) -> Creative:
    from app.models import RawCreative  # local import to avoid startup overhead

    assert isinstance(rc, RawCreative)

    first = rc.first_seen_at
    last = rc.last_seen_at
    run_days = max(0, (last - first).days)

    share = rc.share or 0.0
    impressions = max(10_000, int(share * _MARKET_TOTAL_IMPRESSIONS))
    score = min(100, max(1, int(share * 1_200)))
    spend = max(1_000, int(impressions * 0.04))

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

    return CompetitorGame(
        game=adv.get("name") or adv.get("app_name") or "Unknown",
        subGenre="Puzzle",
        appStoreRank=rank,
        monthlySpend=monthly_spend,
        spendTier=tier,
        status="Active",
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


@app.get("/api/creatives", response_model=list[Creative])
def get_creatives(
    game_name: str | None = Query(None),
    category_id: int = Query(7012),
    country: str = Query("US"),
    period: str = Query("month"),
    period_date: str = Query(DEFAULT_DATE),
    limit: int = Query(24, ge=1, le=80),
):
    """Return top ad creatives across all networks, shaped for the frontend.

    When ``game_name`` is supplied, SensorTower resolves it first and uses its
    category to scope the ad-intel query.
    """
    from app.sources.sensortower import fetch_top_creatives

    if game_name:
        category_id, _ = _resolve_category(game_name, category_id)

    per_network = max(1, limit // len(_NETWORKS))
    results: list[Creative] = []

    for st_network, fe_network in _NETWORKS:
        try:
            raws = fetch_top_creatives(
                category_id=category_id,
                country=country,
                network=st_network,
                period=period,
                period_date=period_date,
                max_creatives=per_network,
            )
            for rc in raws:
                c = _raw_to_creative(rc)
                results.append(c.model_copy(update={"network": fe_network}))
        except Exception:
            log.exception("fetch_top_creatives failed for network %s", st_network)

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


# ---------------------------------------------------------------------------
# Geographic heatmap — market intensity per country
# ---------------------------------------------------------------------------

# 34 major markets with centroids (lat, lng) for the dot-grid SVG projection
_GEO_COUNTRIES: list[tuple[str, str, str, float, float]] = [
    # (code, name, continent, lat, lng)
    ("US", "United States",       "North America", 38.9,  -95.7),
    ("CA", "Canada",               "North America", 56.1, -106.3),
    ("MX", "Mexico",               "North America", 23.6, -102.6),
    ("BR", "Brazil",               "South America",-14.2,  -51.9),
    ("AR", "Argentina",            "South America",-38.4,  -63.6),
    ("CO", "Colombia",             "South America",  4.6,  -74.1),
    ("GB", "United Kingdom",       "Europe",        55.4,   -3.4),
    ("FR", "France",               "Europe",        46.2,    2.2),
    ("DE", "Germany",              "Europe",        51.2,   10.5),
    ("IT", "Italy",                "Europe",        41.9,   12.6),
    ("ES", "Spain",                "Europe",        40.5,   -3.7),
    ("NL", "Netherlands",          "Europe",        52.1,    5.3),
    ("SE", "Sweden",               "Europe",        60.1,   18.6),
    ("PL", "Poland",               "Europe",        51.9,   19.1),
    ("RU", "Russia",               "Europe",        61.5,  105.3),
    ("TR", "Turkey",               "Middle East",   38.9,   35.2),
    ("SA", "Saudi Arabia",         "Middle East",   23.9,   45.1),
    ("AE", "UAE",                  "Middle East",   23.4,   53.8),
    ("IL", "Israel",               "Middle East",   31.0,   34.9),
    ("JP", "Japan",                "Asia",          36.2,  138.3),
    ("KR", "South Korea",          "Asia",          35.9,  127.8),
    ("CN", "China",                "Asia",          35.9,  104.2),
    ("IN", "India",                "Asia",          20.6,   79.1),
    ("ID", "Indonesia",            "Asia",          -0.8,  113.9),
    ("TH", "Thailand",             "Asia",          15.9,  100.9),
    ("SG", "Singapore",            "Asia",           1.4,  103.8),
    ("TW", "Taiwan",               "Asia",          23.7,  121.0),
    ("PH", "Philippines",          "Asia",          12.9,  121.8),
    ("MY", "Malaysia",             "Asia",           4.2,  108.0),
    ("AU", "Australia",            "Oceania",      -25.3,  133.8),
    ("NZ", "New Zealand",          "Oceania",      -40.9,  174.9),
    ("ZA", "South Africa",         "Africa",       -29.0,   25.1),
    ("NG", "Nigeria",              "Africa",         9.1,    8.7),
    ("EG", "Egypt",                "Africa",        26.8,   30.8),
]

# Approximate capture radius per country code (degrees, for dot-grid coloring)
_GEO_RADIUS: dict[str, float] = {
    "RU": 20.0, "CA": 18.0, "CN": 14.0, "US": 13.0, "BR": 13.0,
    "AU": 12.0, "IN": 10.0, "AR":  9.0, "MX":  8.0, "SA":  8.0,
    "ID":  8.0, "MY":  5.0, "TR":  6.0, "EG":  6.0, "NG":  6.0,
}
_GEO_RADIUS_DEFAULT = 6.0


class CountrySignal(BaseModel):
    country_code: str
    country_name: str
    continent: str
    lat: float
    lng: float
    radius: float
    num_advertisers: int
    top_sov: float
    market_intensity: float  # 0–100


def _fetch_country_signal(
    code: str,
    name: str,
    continent: str,
    lat: float,
    lng: float,
    *,
    category_id: int,
    period: str,
    period_date: str,
) -> CountrySignal:
    from app.sources.sensortower import fetch_top_advertisers

    radius = _GEO_RADIUS.get(code, _GEO_RADIUS_DEFAULT)
    try:
        advs = fetch_top_advertisers(
            category_id=category_id,
            country=code,
            period=period,
            period_date=period_date,
            limit=10,
        )
        top_sov: float = advs[0].get("sov") or advs[0].get("share") or 0.0 if advs else 0.0
        num_advertisers = len(advs)
        intensity = min(100.0, top_sov * 700 + num_advertisers * 4)
    except Exception:
        log.warning("geo fetch failed for %s", code)
        top_sov, num_advertisers, intensity = 0.0, 0, 0.0

    return CountrySignal(
        country_code=code,
        country_name=name,
        continent=continent,
        lat=lat,
        lng=lng,
        radius=radius,
        num_advertisers=num_advertisers,
        top_sov=round(top_sov, 4),
        market_intensity=round(intensity, 1),
    )


@app.get("/api/geo-signals", response_model=list[CountrySignal])
def get_geo_signals(
    game_name: str | None = Query(None),
    category_id: int = Query(7012),
    period: str = Query("month"),
    period_date: str = Query(DEFAULT_DATE),
):
    """Return market-intensity signals for ~34 countries as a dot-grid heatmap source.

    Queries SensorTower top-advertisers per country in a thread pool (cached on
    disk so subsequent calls are instant). ``market_intensity`` ∈ [0, 100] is a
    composite of top-advertiser SOV and number of active advertisers — it
    represents how hotly contested the category is in each market.
    """
    import concurrent.futures

    if game_name:
        category_id, _ = _resolve_category(game_name, category_id)

    def _fetch(row: tuple) -> CountrySignal:
        code, name, continent, lat, lng = row
        return _fetch_country_signal(
            code, name, continent, lat, lng,
            category_id=category_id,
            period=period,
            period_date=period_date,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(_fetch, _GEO_COUNTRIES))

    return results


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
