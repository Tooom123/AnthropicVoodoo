"""SensorTower API client.

Owner: Partner 1. This is the v1 baseline extracted by Edouard from
``notebooks/02_pipeline_e2e.py`` so the Streamlit pipeline can ship.
Refactor freely — the public surface (``resolve_game``, ``fetch_top_advertisers``,
``fetch_top_creatives``) is what ``app.pipeline`` consumes and should stay
stable.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import httpx

from app._cache import disk_cached
from app._paths import CACHE_DIR
from app.models import AppMetadata, RawCreative

log = logging.getLogger(__name__)

ST_BASE = "https://api.sensortower.com"
DEFAULT_CACHE_DIR = CACHE_DIR / "sensortower"


# ---------------------------------------------------------------------------
# Low-level GET
# ---------------------------------------------------------------------------


def _token() -> str:
    token = os.environ.get("SENSORTOWER_API_KEY")
    if not token:
        raise RuntimeError("SENSORTOWER_API_KEY missing. Add it to .env.")
    return token


def _get(path: str, params: dict[str, Any]) -> dict:
    """SensorTower GET helper — auto-injects auth_token, raises on non-2xx."""
    full_params = {**params, "auth_token": _token()}
    with httpx.Client(timeout=30.0) as client:
        r = client.get(f"{ST_BASE}{path}", params=full_params)
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def resolve_game(term: str, *, country: str = "US") -> AppMetadata:
    """Search SensorTower for ``term``, fetch the top hit's iOS metadata.

    Combines ``/v1/unified/search_entities`` + ``/v1/ios/apps``. Caches both
    responses under ``data/cache/sensortower/``.
    """
    search_params = {"entity_type": "app", "term": term, "limit": 5}
    search = disk_cached(
        DEFAULT_CACHE_DIR,
        f"search_{term}",
        search_params,
        lambda: _get("/v1/unified/search_entities", search_params),
    )

    candidates = search if isinstance(search, list) else search.get("apps", [])
    if not candidates:
        raise ValueError(
            f"No SensorTower match for {term!r}. Try a more specific name."
        )

    target = candidates[0]
    ios_apps = target.get("ios_apps") or []
    if not ios_apps:
        raise ValueError(f"No iOS variant for {term!r}.")

    ios_app_id = str(ios_apps[0].get("app_id") or ios_apps[0].get("id"))

    meta_params = {"app_ids": ios_app_id, "country": country}
    meta_resp = disk_cached(
        DEFAULT_CACHE_DIR,
        f"meta_{ios_app_id}_{country}",
        meta_params,
        lambda: _get("/v1/ios/apps", meta_params),
    )
    meta = meta_resp["apps"][0]

    return AppMetadata(
        app_id=str(meta["app_id"]),
        unified_app_id=str(target["app_id"]),
        name=meta["name"],
        publisher_name=meta["publisher_name"],
        icon_url=meta["icon_url"],
        categories=meta.get("categories", []),
        description=meta.get("description", ""),
        screenshot_urls=meta.get("screenshot_urls", []),
        rating=meta.get("rating"),
        rating_count=meta.get("rating_count"),
    )


def fetch_top_advertisers(
    *,
    category_id: int,
    country: str,
    period: str,
    period_date: str,
    limit: int = 10,
) -> list[dict]:
    """Top advertisers by Share-of-Voice for category × country × period.

    Uses ``network=All Networks`` (only this endpoint accepts it).
    Returns the raw ``apps`` list from SensorTower (each has ``name``,
    ``publisher_name``, ``sov``, ``app_id``...).
    """
    params = {
        "role": "advertisers",
        "date": period_date,
        "period": period,
        "category": category_id,
        "country": country,
        "network": "All Networks",
        "limit": limit,
    }
    resp = disk_cached(
        DEFAULT_CACHE_DIR,
        f"top_apps_{category_id}_{country}_{period}_{period_date}",
        params,
        lambda: _get("/v1/unified/ad_intel/top_apps", params),
    )
    return resp.get("apps") or resp.get("top_apps") or []


def fetch_top_creatives(
    *,
    category_id: int,
    country: str,
    network: str,
    period: str,
    period_date: str,
    max_creatives: int = 8,
    ad_types: str = "video,video-interstitial",
    aspect_ratios: str = "9:16",
    video_durations: str = ":15",
    new_creative: bool = False,
) -> list[RawCreative]:
    """Top creatives in the category for a single network.

    ``creatives/top`` rejects ``network=All Networks`` — pass one network only.
    Each ad_unit groups visually-similar creatives (same ``phashion_group``);
    we take the first creative per ad_unit.
    """
    params = {
        "date": period_date,
        "period": period,
        "category": category_id,
        "country": country,
        "network": network,
        "ad_types": ad_types,
        "aspect_ratios": aspect_ratios,
        "video_durations": video_durations,
        "new_creative": "true" if new_creative else "false",
        "limit": max_creatives,
    }
    resp = disk_cached(
        DEFAULT_CACHE_DIR,
        f"creatives_top_{category_id}_{network}_{period_date}",
        params,
        lambda: _get("/v1/unified/ad_intel/creatives/top", params),
    )

    raw_creatives: list[RawCreative] = []
    for ad_unit in resp.get("ad_units", [])[:max_creatives]:
        creatives_in_unit = ad_unit.get("creatives") or []
        if not creatives_in_unit:
            continue
        c = creatives_in_unit[0]

        try:
            raw_creatives.append(
                RawCreative(
                    creative_id=str(c["id"]),
                    ad_unit_id=str(ad_unit["id"]),
                    app_id=str(ad_unit.get("app_id") or "unknown"),
                    advertiser_name=(ad_unit.get("app_info") or {}).get("name", "unknown"),
                    network=ad_unit.get("network", network),
                    ad_type=ad_unit.get("ad_type", "video"),
                    creative_url=c["creative_url"],
                    thumb_url=c.get("thumb_url"),
                    preview_url=c.get("preview_url"),
                    phashion_group=ad_unit.get("phashion_group"),
                    share=ad_unit.get("share"),
                    first_seen_at=ad_unit["first_seen_at"],
                    last_seen_at=ad_unit["last_seen_at"],
                    video_duration=c.get("video_duration"),
                    aspect_ratio=(
                        f"{c.get('width')}:{c.get('height')}" if c.get("width") else None
                    ),
                    width=c.get("width"),
                    height=c.get("height"),
                    message=c.get("message"),
                    button_text=c.get("button_text"),
                )
            )
        except Exception:  # noqa: BLE001
            log.exception("Failed to parse creative %s", c.get("id"))
            continue

    return raw_creatives
