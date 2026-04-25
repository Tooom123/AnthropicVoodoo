"""HookLens API bridge — exposes SensorTower metrics to the React frontend.

Run:
    uv run uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
log = logging.getLogger(__name__)

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


_REPORTS_DIR = Path(__file__).parent.parent / "data" / "cache" / "reports"


class ReportSummary(BaseModel):
    app_id: str
    game_name: str
    generated_at: str
    num_archetypes: int
    num_variants: int


@app.get("/api/reports", response_model=list[ReportSummary])
def list_reports():
    """List all cached HookLens reports as lightweight summaries."""
    if not _REPORTS_DIR.exists():
        return []
    summaries: list[ReportSummary] = []
    for path in sorted(_REPORTS_DIR.glob("*_e2e.json")):
        try:
            data = json.loads(path.read_text())
            game = data.get("target_game", {})
            summaries.append(
                ReportSummary(
                    app_id=game.get("app_id", path.stem.replace("_e2e", "")),
                    game_name=game.get("name", "Unknown"),
                    generated_at=data.get("generated_at", ""),
                    num_archetypes=len(data.get("top_archetypes", [])),
                    num_variants=len(data.get("final_variants", [])),
                )
            )
        except Exception:
            log.exception("Failed to parse report %s", path)
    return summaries


@app.get("/api/report")
def get_report(game_name: str = Query(...)):
    """Return the full HookLensReport for a game, if cached."""
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse

    if not _REPORTS_DIR.exists():
        raise HTTPException(status_code=404, detail="No reports cached yet")

    # Try resolving app_id via SensorTower to get the exact filename
    try:
        from app.sources.sensortower import resolve_game
        meta = resolve_game(game_name)
        candidates = list(_REPORTS_DIR.glob(f"{meta.app_id}_e2e.json"))
    except Exception:
        candidates = []

    # Fallback: fuzzy match by game name inside any report
    if not candidates:
        for path in _REPORTS_DIR.glob("*_e2e.json"):
            try:
                data = json.loads(path.read_text())
                if game_name.lower() in data.get("target_game", {}).get("name", "").lower():
                    candidates = [path]
                    break
            except Exception:
                continue

    if not candidates:
        raise HTTPException(status_code=404, detail=f"No cached report for '{game_name}'")

    return JSONResponse(content=json.loads(candidates[0].read_text()))


@app.get("/health")
def health():
    return {"status": "ok", "utc": datetime.now(timezone.utc).isoformat()}
