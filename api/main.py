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
from fastapi.staticfiles import StaticFiles
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
    allow_methods=["GET", "POST"],
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


# Strict category-based filtering doesn't work on this dataset:
# SensorTower's ``creatives_top`` endpoint returns ``app_info.categories=None``
# for ~100% of the cached ad_units (we checked: 1308/1308 in the demo cache).
# So we filter via a **name/publisher blocklist** instead — pragmatic, covers
# the offenders that actually leak through SensorTower's category filter
# (food chains, news apps, retail brands), and never risks dropping legit
# game advertisers when their categories field is empty.
_NON_GAME_NAME_KEYWORDS: tuple[str, ...] = (
    "burger king",
    "mcdonald",
    "papa murphy",
    "papa john",
    "starbucks",
    "taco bell",
    "kfc",
    "subway",
    "pizza hut",
    "domino",
    "racing post",  # UK horse-racing newspaper that leaked into Puzzle US
    "dunkin",
    "chipotle",
    "wendy",
)
_NON_GAME_PUBLISHERS: tuple[str, ...] = (
    "restaurant brands international",  # Burger King's parent
    "papa murphy",
    "papa john",
    "racing post",
    "starbucks",
    "mcdonald",
    "yum! brands",
    "yum brands",
)


def _is_likely_non_game(advertiser_name: str | None, publisher_name: str | None) -> bool:
    """Heuristic blocklist for advertisers that are clearly not mobile games.

    Pure name-substring match on a curated list. Cheap, no false-negatives
    on legit games (the keyword list is conservative — common gaming app
    names don't contain "burger" or "starbucks").
    """
    name = (advertiser_name or "").lower()
    pub = (publisher_name or "").lower()
    return any(k in name for k in _NON_GAME_NAME_KEYWORDS) or any(
        k in pub for k in _NON_GAME_PUBLISHERS
    )


def _index_sensortower_app_info() -> dict[str, dict[str, Any]]:
    """Build a creative_id → {publisher_name, icon_url, advertiser_name}
    index by scanning every cached SensorTower ``creatives_top_*.json``
    on disk. Cheap (10-30 small files for the whole demo cache).

    Used to enrich ``/api/creatives`` responses with real publisher /
    icon data that ``fetch_top_creatives`` flattens away into the
    ``RawCreative`` shape.
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
            for c in au.get("creatives") or []:
                cid = str(c.get("id") or "")
                if not cid or cid in out:
                    continue
                out[cid] = {
                    "publisher_name": info.get("publisher_name"),
                    "icon_url": info.get("icon_url"),
                    "advertiser_name": info.get("name"),
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
    """Map a SensorTower top-advertiser row to the frontend's CompetitorGame.

    Note on field provenance:
      - ``game``, ``app_id``, ``sov`` (Share of Voice) come straight from
        SensorTower's ``top_advertisers`` endpoint.
      - ``appStoreRank`` is intentionally just ``rank`` (1-N) — i.e. the
        rank within the SoV-sorted list of top advertisers in this
        category. The frontend column is labelled "SoV rank" to make
        this honest.
      - ``monthlySpend`` is a SYNTHETIC ESTIMATE derived from SoV
        (``sov × $8M``). SensorTower exposes paid UA *download* counts
        but not USD spend, so this is a heuristic; the frontend tooltip
        flags it as estimated.
      - ``subGenre`` is best-effort from the SensorTower row's
        ``categories`` field when present, falling back to "Mobile game".
        Previously hardcoded "Puzzle" for everyone.
    """
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

    # Best-effort sub-genre extraction. SensorTower wraps categories in a
    # few different shapes depending on endpoint; try the most common ones
    # before falling back to a generic label.
    sub_genre = "Mobile game"
    cats = (
        adv.get("categories")
        or adv.get("category_names")
        or (adv.get("app_info") or {}).get("categories")
    )
    if isinstance(cats, list) and cats:
        first = cats[0]
        if isinstance(first, str):
            sub_genre = first
        elif isinstance(first, dict):
            sub_genre = (
                first.get("name")
                or first.get("category_name")
                or sub_genre
            )

    return CompetitorGame(
        game=adv.get("name") or adv.get("app_name") or "Unknown",
        subGenre=sub_genre,
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
                # Skip the non-game advertisers (Burger King, Papa Murphy's,
                # Racing Post…) that SensorTower's category filter leaks
                # through. Strict category-based filtering doesn't work
                # because ``app_info.categories`` is ``null`` on every
                # ``creatives_top`` row in this tenant — name/publisher
                # blocklist is the pragmatic alternative.
                extra = app_info_index.get(rc.creative_id) or {}
                if _is_likely_non_game(
                    rc.advertiser_name, extra.get("publisher_name")
                ):
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
        # top_sov is already a percentage (0–100 scale).
        # Use it directly — frontend normalize() maps min→blue, max→red.
        # High top_sov = one dominant advertiser (concentrated market).
        # Low top_sov = spread competition (fragmented market).
        intensity = round(top_sov, 2) if num_advertisers > 0 else 0.0
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


def _build_app_id_to_icon_index() -> dict[str, tuple[str, str | None]]:
    """Build an ``app_id → (icon_url, publisher_name)`` index by scanning
    the cached SensorTower app metadata JSONs (``meta_<app_id>_<...>.json``)
    plus the Voodoo catalog. Used by ``/api/reports`` to enrich the
    "Recent analyses" cards with real game icons.

    Cheap (a few dozen file reads, no API calls).
    """
    index: dict[str, tuple[str, str | None]] = {}

    # 1. Voodoo catalog (509 apps, fast)
    try:
        catalog_path = CACHE_DIR / "voodoo" / "catalog.json"
        if catalog_path.exists():
            for entry in json.loads(catalog_path.read_text()):
                app_id = str(entry.get("app_id") or "")
                icon = entry.get("icon_url")
                pub = entry.get("publisher_name")
                if app_id and icon:
                    index[app_id] = (str(icon), pub)
    except Exception:
        log.exception("Failed to read Voodoo catalog for icon index")

    # 2. SensorTower meta cache files — covers any non-Voodoo app the
    #    pipeline has touched (e.g. Block Blast!, etc.).
    st_cache = CACHE_DIR / "sensortower"
    if st_cache.exists():
        for path in st_cache.glob("meta_*.json"):
            try:
                data = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            for app in data.get("apps") or []:
                app_id = str(app.get("app_id") or "")
                icon = app.get("icon_url")
                pub = app.get("publisher_name")
                if app_id and icon and app_id not in index:
                    index[app_id] = (str(icon), pub)
    return index


@app.get("/api/reports", response_model=list[ReportSummary])
def list_reports() -> list[ReportSummary]:
    """List all cached HookLensReports available on disk.

    Used by the frontend to populate the "Recent analyses" grid on the
    Insights landing — instant load on click vs running the full pipeline.

    Each row is enriched with the target game's ``icon_url`` and
    ``publisher_name`` looked up against the Voodoo catalog + the
    SensorTower meta cache, so the UI can show a real app icon next to
    the name instead of a gradient placeholder.
    """
    if not REPORTS_CACHE_DIR.exists():
        return []

    icon_index = _build_app_id_to_icon_index()

    out: list[ReportSummary] = []
    for path in sorted(REPORTS_CACHE_DIR.glob("*_e2e.json")):
        try:
            data = json.loads(path.read_text())
            tg = data.get("target_game", {})
            app_id = tg.get("app_id", path.stem.removesuffix("_e2e"))
            icon_url, publisher = icon_index.get(str(app_id), (None, None))
            out.append(
                ReportSummary(
                    app_id=app_id,
                    name=tg.get("name", "Unknown"),
                    publisher=publisher,
                    icon_url=icon_url,
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


def _full_step_payload(step_id: str, payload: Any) -> Any:
    """Produce a richer JSON-safe snapshot of a step's output for SSE
    clients that want to render partial sections of the report as the
    pipeline streams.

    Unlike :func:`_summarize_step_payload` (chips-only), this returns
    the actual data the frontend needs to populate components like
    ``GameDnaCard`` / ``ArchetypesTable`` / ``BriefsGrid`` — each one
    capped at top-K to keep per-event size under ~50 KB.

    Returns ``None`` when there's nothing useful to ship for this step.
    """
    if payload is None:
        return None
    try:
        # Pydantic v2 models — use .model_dump() with mode="json" so dates
        # / enums / nested models all serialize cleanly.
        if hasattr(payload, "model_dump"):
            return payload.model_dump(mode="json")
        if isinstance(payload, list):
            out = []
            # Cap at 20 to bound bandwidth; archetypes/briefs/variants are
            # capped well below this in the pipeline anyway.
            for item in payload[:20]:
                if hasattr(item, "model_dump"):
                    out.append(item.model_dump(mode="json"))
                elif isinstance(item, dict):
                    out.append(item)
            return out
        if isinstance(payload, dict):
            return payload
    except Exception:
        log.exception("full payload dump failed for step %s", step_id)
    return None


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
            # Richer payload for the live partial report view — only
            # shipped for steps where the frontend has a component
            # ready to render the data progressively.
            "data": _full_step_payload(step_id, payload),
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
# Video brief endpoint — brainrot video ad concept from cached GameDNA
# ---------------------------------------------------------------------------

from app.creative.video_brief import (  # noqa: E402
    VideoAdConcept,
    VideoAdResult,
    generate_video_concept,
    generate_scenario_video,
)


def _load_game_dna(game_name: str):
    """Shared helper: load GameDNA from the most recent cached report.

    Supports multiple naming conventions used by different pipeline versions:
      - report_{slug}*.json   (canonical)
      - {app_id}_e2e.json     (notebook runner)
      - any .json in REPORTS_CACHE_DIR whose target_game.name matches
    """
    from app.models import HookLensReport  # noqa: PLC0415

    slug = game_name.strip().lower().replace(" ", "_")

    # Fast path — pattern-based
    candidates = (
        list(REPORTS_CACHE_DIR.glob(f"report_{slug}*.json"))
        + list(REPORTS_CACHE_DIR.glob(f"report_*{slug}*.json"))
    )

    # Slow path — scan all .json files for a name match
    if not candidates:
        for path in REPORTS_CACHE_DIR.glob("*.json"):
            try:
                raw = json.loads(path.read_text())
                name = (raw.get("target_game") or {}).get("name", "")
                if name.strip().lower() == game_name.strip().lower():
                    candidates.append(path)
            except Exception:
                continue

    if not candidates:
        raise HTTPException(
            status_code=404,
            detail=f"No cached report for '{game_name}'. Run the pipeline first.",
        )

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    try:
        report = HookLensReport.model_validate_json(candidates[0].read_text())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse report: {exc}") from exc
    return report.target_game


# ---------------------------------------------------------------------------
# Single-creative deep dive — powers the /ad/$id detail page
# ---------------------------------------------------------------------------


class CreativeDetailMedia(BaseModel):
    creative_url: str | None = None
    preview_url: str | None = None
    thumb_url: str | None = None
    width: int | None = None
    height: int | None = None
    aspect_ratio: str | None = None
    video_duration: int | None = None
    title: str | None = None
    button_text: str | None = None
    message: str | None = None


class CreativeDetailApp(BaseModel):
    app_id: str
    name: str
    publisher_name: str | None = None
    icon_url: str | None = None
    canonical_country: str | None = None


class SimilarCreative(BaseModel):
    creative_id: str
    network: str
    ad_type: str
    thumb_url: str | None
    advertiser_name: str | None
    icon_url: str | None
    first_seen_at: str | None
    days_active: int


class CreativeDetail(BaseModel):
    """Full payload for the ``/ad/$id`` detail page — every field comes
    from cached SensorTower data (no mocks). Returns 404 if the creative
    isn't in any cached ``creatives_top_*.json``.
    """

    creative_id: str
    network: str
    ad_type: str
    ad_formats: list[str]
    first_seen_at: str | None
    last_seen_at: str | None
    days_active: int
    phashion_group: str | None
    media: CreativeDetailMedia
    app: CreativeDetailApp
    siblings: list[SimilarCreative]


def _scan_all_creatives() -> list[dict[str, Any]]:
    """Iterate every ``ad_unit`` from every cached ``creatives_top_*.json``.
    Yields raw dicts (not Pydantic) since each row carries the bundled
    ``app_info`` block which we want to keep intact for enrichment.
    """
    out: list[dict[str, Any]] = []
    st_cache = CACHE_DIR / "sensortower"
    if not st_cache.exists():
        return out
    for path in st_cache.glob("creatives_top_*.json"):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for au in data.get("ad_units") or []:
            out.append(au)
    return out


@app.get("/api/creatives/{creative_id}", response_model=CreativeDetail)
def get_creative_detail(creative_id: str) -> CreativeDetail:
    """Return rich detail for one creative by its SensorTower id."""
    units = _scan_all_creatives()

    # Find the unit — the URL ``id`` is the ad_unit id (= phashion_group),
    # which equals ``creatives[0].id`` in 99% of rows.
    target: dict[str, Any] | None = None
    for au in units:
        if str(au.get("id") or "") == creative_id:
            target = au
            break
        for c in au.get("creatives") or []:
            if str(c.get("id") or "") == creative_id:
                target = au
                break
        if target is not None:
            break

    if target is None:
        raise HTTPException(status_code=404, detail=f"Creative {creative_id} not in cache")

    media_src = (target.get("creatives") or [{}])[0]
    info = target.get("app_info") or {}

    first = target.get("first_seen_at")
    last = target.get("last_seen_at")
    try:
        days = (
            (datetime.fromisoformat(last) - datetime.fromisoformat(first)).days
            if first and last
            else 0
        )
    except (TypeError, ValueError):
        days = 0
    days = max(0, days)

    # Aspect ratio derived from width/height if both present
    w, h = media_src.get("width"), media_src.get("height")
    aspect = None
    if isinstance(w, (int, float)) and isinstance(h, (int, float)) and h:
        ratio = w / h
        if abs(ratio - 9 / 16) < 0.05:
            aspect = "9:16"
        elif abs(ratio - 1.0) < 0.05:
            aspect = "1:1"
        elif abs(ratio - 16 / 9) < 0.05:
            aspect = "16:9"
        elif abs(ratio - 4 / 5) < 0.05:
            aspect = "4:5"
        else:
            aspect = f"{w}:{h}"

    # Sibling creatives — same advertiser app_id, ranked by days_active desc,
    # excluding the current one. Caps at 6.
    same_app = [
        au
        for au in units
        if str(au.get("app_id") or "") == str(target.get("app_id") or "")
        and str(au.get("id") or "") != creative_id
    ]

    def _days(au: dict[str, Any]) -> int:
        try:
            return max(
                0,
                (
                    datetime.fromisoformat(au.get("last_seen_at"))
                    - datetime.fromisoformat(au.get("first_seen_at"))
                ).days,
            )
        except (TypeError, ValueError):
            return 0

    same_app.sort(key=_days, reverse=True)
    siblings: list[SimilarCreative] = []
    seen_sibling_ids: set[str] = set()
    for au in same_app:
        sid = str(au.get("id") or "")
        if not sid or sid in seen_sibling_ids:
            continue
        seen_sibling_ids.add(sid)
        if len(siblings) >= 6:
            break
        s_media = (au.get("creatives") or [{}])[0]
        s_info = au.get("app_info") or {}
        siblings.append(
            SimilarCreative(
                creative_id=str(au.get("id") or ""),
                network=str(au.get("network") or ""),
                ad_type=str(au.get("ad_type") or ""),
                thumb_url=s_media.get("thumb_url"),
                advertiser_name=s_info.get("name"),
                icon_url=s_info.get("icon_url"),
                first_seen_at=au.get("first_seen_at"),
                days_active=_days(au),
            )
        )

    return CreativeDetail(
        creative_id=creative_id,
        network=str(target.get("network") or ""),
        ad_type=str(target.get("ad_type") or ""),
        ad_formats=list(target.get("ad_formats") or []),
        first_seen_at=first,
        last_seen_at=last,
        days_active=days,
        phashion_group=target.get("phashion_group"),
        media=CreativeDetailMedia(
            creative_url=media_src.get("creative_url"),
            preview_url=media_src.get("preview_url"),
            thumb_url=media_src.get("thumb_url"),
            width=w if isinstance(w, int) else None,
            height=h if isinstance(h, int) else None,
            aspect_ratio=aspect,
            video_duration=media_src.get("video_duration"),
            title=media_src.get("title"),
            button_text=media_src.get("button_text"),
            message=media_src.get("message"),
        ),
        app=CreativeDetailApp(
            app_id=str(info.get("app_id") or target.get("app_id") or ""),
            name=str(info.get("name") or info.get("humanized_name") or "Unknown"),
            publisher_name=info.get("publisher_name"),
            icon_url=info.get("icon_url"),
            canonical_country=info.get("canonical_country"),
        ),
        siblings=siblings,
    )


@app.get("/api/video-brief", response_model=VideoAdConcept)
def get_video_brief(game_name: str = Query(...)) -> VideoAdConcept:
    """Return (or generate) the brainrot VideoAdConcept for a game (LLM step only, fast)."""
    if not game_name.strip():
        raise HTTPException(status_code=400, detail="game_name is required")
    dna = _load_game_dna(game_name)
    return generate_video_concept(dna)


@app.get("/api/video-brief/generate", response_model=VideoAdResult)
def generate_video(game_name: str = Query(...)) -> VideoAdResult:
    """Trigger Scenario video generation for the brainrot concept and return the video URL.

    This is the slow step (Veo 3 takes 2-5 min). The result is disk-cached
    so subsequent calls return immediately.
    """
    if not game_name.strip():
        raise HTTPException(status_code=400, detail="game_name is required")
    dna = _load_game_dna(game_name)
    concept = generate_video_concept(dna)
    return generate_scenario_video(concept)


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


# ---------------------------------------------------------------------------
# Per-variant Generate Ad — fires N parallel Scenario img2video calls,
# concatenates the resulting clips with ffmpeg, optionally appends the
# game's pre-rendered endcard, and serves the final mp4 over /videos.
# ---------------------------------------------------------------------------

# Mount /videos as a static directory so the React UI can <video src="/videos/...">.
# Existing files (the multi-clip CLI outputs in scripts/generate_demo_video.py)
# are also served from here, which means demo_<game>_full.mp4 becomes
# /videos/demo_<game>_full.mp4 for free.
_VIDEOS_DIR = CACHE_DIR / "videos"
_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/videos", StaticFiles(directory=str(_VIDEOS_DIR)), name="videos")

# Default Scenario video model for per-variant rendering. Single-frame
# image-to-video (i2v) — one call per frame, parallelized N=3 by the
# endpoint so the user sees their ad in ~3-5 minutes instead of 9-15.
# Override with SCENARIO_VARIANT_VIDEO_MODEL env var.
import os as _os

_VARIANT_VIDEO_MODEL = _os.environ.get(
    "SCENARIO_VARIANT_VIDEO_MODEL",
    "model_kling-o1-i2v",
)
_ENDCARDS_DIR = CACHE_DIR / "endcards"


class VariantVideoResponse(BaseModel):
    video_url: str
    """Path served under the API's /videos mount, e.g. ``/videos/variant_xxx.mp4``."""

    cached: bool
    """``True`` when the final mp4 was already on disk (instant return)."""

    duration_s: float
    """Approximate runtime of the assembled ad in seconds."""

    clips: int
    """How many Scenario clips were concatenated (typically 3)."""

    endcard_appended: bool
    """``True`` when a pre-rendered endcard was concatenated at the end."""

    job_ids: list[str]
    """Scenario job IDs for traceability — empty when fully cached."""

    stub: bool
    """``True`` when one or more clips fell back to a Picsum placeholder
    (e.g. Scenario auth missing or job timed out). Frontend should warn."""


def _slugify_game(name: str) -> str:
    import re

    return re.sub(r"[^a-zA-Z0-9_-]+", "_", name).strip("_-").lower() or "demo"


def _download_to(url: str, dest: Path) -> Path:
    """Mirror of scripts.generate_demo_video._download — used for both
    Scenario CDN downloads and SensorTower asset URLs."""
    import httpx

    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


@app.post("/api/variants/render-video", response_model=VariantVideoResponse)
async def render_variant_video(
    game_name: str = Query(..., description="Target game name (matches a cached report)"),
    archetype_id: str = Query(..., description="Which variant to render"),
    include_endcard: bool = Query(
        True,
        description="Append the game's pre-rendered endcard at the end if available",
    ),
    model: str | None = Query(
        None,
        description="Override the Scenario video model (defaults to env or Kling i2v)",
    ),
) -> VariantVideoResponse:
    """Generate a finished ad video for one variant of a cached report.

    Pipeline:
      1. Load the cached HookLensReport for ``game_name``.
      2. Pick the variant matching ``archetype_id`` (its hero +
         storyboard frames, plus the brief's scenario_prompts which
         carry the per-frame motion + audio cues).
      3. Download each frame to ``data/cache/scenario_frames/<slug>/``.
      4. Fire N parallel ``call_scenario_video`` calls (N = 3 typically)
         — one image-to-video call per frame, capped by an
         ``asyncio.Semaphore`` so we don't trigger Scenario tenant-wide
         throttles.
      5. ffmpeg-concat the resulting mp4s into
         ``data/cache/videos/variant_<archetype_id>.mp4``.
      6. Optionally append the game's pre-rendered endcard from
         ``data/cache/endcards/<app_id>.mp4``.
      7. Return ``/videos/...`` URL the frontend can play directly.

    Cached aggressively: if the final mp4 already exists on disk we
    return it instantly without recomputing. Re-clicks during the demo
    are zero-latency.
    """
    import re

    # 1. Load report
    cache_path = REPORTS_CACHE_DIR / f"{_resolve_app_id_for_game(game_name)}_e2e.json"
    if not cache_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No cached report for {game_name!r} — run the pipeline first",
        )
    report = json.loads(cache_path.read_text())
    target_game = report.get("target_game") or {}
    app_id = str(target_game.get("app_id") or "")
    game_slug = _slugify_game(target_game.get("name") or game_name)

    # 2. Find the variant
    variants = report.get("final_variants") or []
    variant = next(
        (v for v in variants if (v.get("brief") or {}).get("archetype_id") == archetype_id),
        None,
    )
    if variant is None:
        raise HTTPException(
            status_code=404,
            detail=f"Variant {archetype_id!r} not found in {game_name!r}",
        )
    brief = variant.get("brief") or {}
    hero_url = variant.get("hero_frame_path") or ""
    storyboard_urls = variant.get("storyboard_paths") or []
    frame_urls = [u for u in [hero_url, *storyboard_urls] if u][:3]
    if not frame_urls:
        raise HTTPException(
            status_code=422,
            detail="Variant has no hero/storyboard frames to videofy",
        )

    # 3. Per-frame motion prompts. Prefer the brief's own scenario_prompts
    #    (which Opus tailored per frame, including audio cues), fall back
    #    to scene_flow beats, then to the global hook.
    scenario_prompts = brief.get("scenario_prompts") or []
    scene_flow = brief.get("scene_flow") or []
    hook_3s = brief.get("hook_3s") or ""
    per_frame_prompts: list[str] = []
    for i in range(len(frame_urls)):
        if i < len(scenario_prompts) and scenario_prompts[i]:
            per_frame_prompts.append(str(scenario_prompts[i])[:500])
        elif i < len(scene_flow) and scene_flow[i]:
            per_frame_prompts.append(str(scene_flow[i])[:500])
        else:
            per_frame_prompts.append(hook_3s[:500] or "5-second cinematic gameplay clip")

    # 4. Final output path — keyed by (archetype_id + endcard mtime) so
    #    a freshly-rendered endcard invalidates the cached final mp4.
    safe_archetype = re.sub(r"[^a-zA-Z0-9_-]+", "-", archetype_id)[:40]
    endcard_for_cache = (
        _endcard_path_for(app_id) if include_endcard else None
    )
    endcard_tag = (
        f"_ec{int(endcard_for_cache.stat().st_mtime)}"
        if endcard_for_cache
        else "_noec"
    )
    final_filename = f"variant_{game_slug}_{safe_archetype}{endcard_tag}.mp4"
    final_path = _VIDEOS_DIR / final_filename
    if final_path.exists() and final_path.stat().st_size > 0:
        return VariantVideoResponse(
            video_url=f"/videos/{final_filename}",
            cached=True,
            duration_s=_estimate_video_duration(final_path),
            clips=len(frame_urls),
            endcard_appended=endcard_for_cache is not None,
            job_ids=[],
            stub=False,
        )

    # 5. Download frames locally for hashing
    frames_dir = CACHE_DIR / "scenario_frames" / game_slug
    frames_dir.mkdir(parents=True, exist_ok=True)
    local_frames: list[Path] = []
    for i, url in enumerate(frame_urls):
        dest = frames_dir / f"{safe_archetype}_frame_{i}.png"
        if not dest.exists() or dest.stat().st_size == 0:
            try:
                _download_to(url, dest)
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to download frame {i}: {exc}",
                ) from exc
        local_frames.append(dest)

    # 6. Fire N parallel Scenario img2video calls.
    #
    # Special handling for the LAST clip when an endcard PNG is on
    # disk: pass it as ``tail_image`` (Kling O1 / Kling 2.6 Pro's
    # ``lastFrameImage`` parameter). The model interpolates between
    # the variant's storyboard frame and the endcard so the concat
    # handoff is a smooth morph rather than a hard cut. Costs the
    # same (single Scenario call, just with one extra asset upload).
    from app.creative.scenario import call_scenario_video

    chosen_model = model or _VARIANT_VIDEO_MODEL
    endcard_png = (
        _ENDCARDS_DIR / f"{app_id}.png"
        if include_endcard and app_id
        else None
    )
    if endcard_png is not None and not endcard_png.exists():
        endcard_png = None

    loop = asyncio.get_running_loop()
    sem = asyncio.Semaphore(3)  # never more than 3 in flight per request

    async def _gen_clip(
        idx: int,
        frame: Path,
        prompt: str,
        tail: Path | None,
    ) -> tuple[int, str, dict]:
        async with sem:
            return await loop.run_in_executor(
                None,
                lambda: (
                    idx,
                    *call_scenario_video(
                        model_id=chosen_model,
                        image_paths=[frame],
                        prompt=prompt,
                        label=f"variant_{game_slug}_{safe_archetype}_clip{idx}",
                        tail_image_path=tail,
                    ),
                ),
            )

    last_idx = len(local_frames) - 1
    log.info(
        "render_variant_video: %s · archetype=%s · %d clips × %s · "
        "tail_image_on_clip%d=%s",
        game_name,
        archetype_id,
        len(local_frames),
        chosen_model,
        last_idx,
        bool(endcard_png),
    )
    try:
        results = await asyncio.gather(
            *[
                _gen_clip(
                    i,
                    frame,
                    per_frame_prompts[i],
                    # Only the LAST clip gets the endcard tail — clips
                    # 1 and 2 stay free-running so they can develop the
                    # narrative without being constrained.
                    endcard_png if i == last_idx else None,
                )
                for i, frame in enumerate(local_frames)
            ]
        )
    except Exception as exc:
        log.exception("Parallel video generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"Scenario video generation failed: {exc}",
        ) from exc

    # 7. Download each clip locally so we can ffmpeg-concat them
    clip_paths: list[Path] = []
    job_ids: list[str] = []
    any_stub = False
    for idx, video_url, meta in sorted(results, key=lambda r: r[0]):
        if meta.get("stub"):
            any_stub = True
        if jid := meta.get("job_id"):
            job_ids.append(str(jid))
        clip_path = _VIDEOS_DIR / f"variant_{game_slug}_{safe_archetype}_clip{idx}.mp4"
        if not clip_path.exists() or clip_path.stat().st_size == 0:
            try:
                _download_to(video_url, clip_path)
            except Exception as exc:
                log.warning("Clip download failed for clip %d: %s", idx, exc)
                continue
        clip_paths.append(clip_path)

    if not clip_paths:
        raise HTTPException(
            status_code=502,
            detail="All clips failed to render — check Scenario credentials / credits",
        )

    # 8. Optionally append the endcard
    endcard = _endcard_path_for(app_id) if include_endcard else None
    concat_inputs = [*clip_paths, endcard] if endcard else clip_paths

    # 9. ffmpeg concat
    if not _ffmpeg_concat(concat_inputs, final_path):
        raise HTTPException(
            status_code=500,
            detail="ffmpeg concat failed — check server logs",
        )

    return VariantVideoResponse(
        video_url=f"/videos/{final_filename}",
        cached=False,
        duration_s=_estimate_video_duration(final_path),
        clips=len(clip_paths),
        endcard_appended=endcard is not None,
        job_ids=job_ids,
        stub=any_stub,
    )


def _resolve_app_id_for_game(game_name: str) -> str:
    """Find the cached report file's stem for a game name.

    Reports are keyed by app_id, but the user passes a game_name. Quick
    scan: read each report's target_game.name and return the first
    case-insensitive match.
    """
    if not REPORTS_CACHE_DIR.exists():
        raise HTTPException(status_code=404, detail="No cached reports yet")
    needle = game_name.strip().lower()
    for path in REPORTS_CACHE_DIR.glob("*_e2e.json"):
        try:
            data = json.loads(path.read_text())
            name = (data.get("target_game", {}).get("name") or "").lower()
            if name == needle:
                return path.stem.removesuffix("_e2e")
        except Exception:
            continue
    raise HTTPException(
        status_code=404,
        detail=f"No cached report matches game name {game_name!r}",
    )


def _endcard_path_for(app_id: str) -> Path | None:
    """Look for a pre-rendered endcard mp4 for this app_id. Returns
    ``None`` when no endcard is on disk — caller will skip the append.
    """
    if not app_id:
        return None
    candidate = _ENDCARDS_DIR / f"{app_id}.mp4"
    if candidate.exists() and candidate.stat().st_size > 0:
        return candidate
    return None


def _ffmpeg_concat(inputs: list[Path], output: Path) -> bool:
    """ffmpeg concat-demuxer with -c copy fallback to re-encode.

    Returns ``True`` on success. The fallback reencodes with libx264
    when the inputs have mismatched codecs/timestamps (common when
    mixing Scenario clips with manually-encoded endcards).
    """
    import subprocess
    import tempfile

    if not inputs:
        return False

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", dir=str(_VIDEOS_DIR), delete=False
    ) as f:
        for p in inputs:
            f.write(f"file '{p.resolve()}'\n")
        list_path = Path(f.name)

    try:
        cmd_copy = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(list_path), "-c", "copy", str(output),
        ]
        proc = subprocess.run(cmd_copy, capture_output=True, text=True)
        if proc.returncode != 0:
            log.info(
                "ffmpeg -c copy failed (%s); retrying with re-encode",
                proc.stderr.strip()[-200:],
            )
            cmd_reencode = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(list_path),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                str(output),
            ]
            proc = subprocess.run(cmd_reencode, capture_output=True, text=True)
            if proc.returncode != 0:
                log.error("ffmpeg re-encode failed: %s", proc.stderr[-500:])
                return False
        return output.exists() and output.stat().st_size > 0
    finally:
        try:
            list_path.unlink()
        except OSError:
            pass


def _estimate_video_duration(path: Path) -> float:
    """Cheap duration estimate via ffprobe; returns 0.0 on failure."""
    import subprocess

    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True, text=True, timeout=10,
        )
        return float(result.stdout.strip())
    except (subprocess.SubprocessError, ValueError):
        return 0.0
