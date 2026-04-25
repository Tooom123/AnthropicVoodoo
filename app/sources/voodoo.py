"""Voodoo catalog harvester.

Single entry point: :func:`fetch_voodoo_catalog`. The result is the full
list of Voodoo-published iOS games as ``AppMetadata`` objects, persisted
to ``data/cache/voodoo/catalog.json`` for 7 days.

Why three SensorTower endpoints (not the spec's two)?
---------------------------------------------------
The original plan used ``/v1/unified/search_entities?entity_type=app&term=Voodoo``
+ a single batched ``/v1/ios/apps`` call. That term-based search ranks by
**name relevance** to "voodoo", so it returns ~5 apps whose *name* contains
the word and skips Voodoo's other ~500 hits — Voodoo's own real catalog is
523 unified apps, almost none of which have "voodoo" in the title.

The reliable path uses ``entity_type=publisher`` first to discover the
publisher dossier (which includes a ``unified_apps[]`` array of every
game Voodoo ever shipped), then resolves unified → iTunes IDs via
``/v1/unified/apps?app_id_type=unified`` before pulling rich iOS metadata
in batched ``/v1/ios/apps`` calls.

Cold-path API budget (per 7-day cache cycle):

- 1 publisher search
- ~6 unified→iTunes mapping calls (chunks of 100)
- ~4 iOS metadata calls (chunks of 100)

Every chunk is independently disk-cached via :func:`app._cache.disk_cached`,
so a re-run that hits the API after the JSON snapshot expires only re-fetches
the chunks whose payloads changed.

Stays consistent with :mod:`app.sources.sensortower` — same ``httpx.Client``,
same ``disk_cached`` helper, same ``AppMetadata`` Pydantic return type.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app._cache import disk_cached
from app._paths import CACHE_DIR
from app.models import AppMetadata
from app.sources.sensortower import _get

log = logging.getLogger(__name__)

VOODOO_CACHE_DIR: Path = CACHE_DIR / "voodoo"
SENSORTOWER_CACHE_DIR: Path = CACHE_DIR / "sensortower"

CATALOG_FILENAME = "catalog.json"
CATALOG_TTL_SECONDS = 7 * 24 * 3600  # 7 days

# The legitimate Voodoo unified publisher_id observed from
# /v1/unified/search_entities?entity_type=publisher&term=Voodoo. Locking on
# the publisher_id (and exact name match as a fallback) is the only way to
# avoid imposter publishers — SensorTower returns ~10 lookalikes that abuse
# zero-width characters or extra suffixes (e.g. ``"VOODOO\u00ad"``,
# ``"Voodoo Technologies Private Limited"``, ``"InVooDoo"``).
VOODOO_PUBLISHER_ID = "59bad4eb63f2dc0d0b9689e1"
VOODOO_PUBLISHER_NAME = "Voodoo"

# Acceptable ``publisher_name`` values on individual app records — used by
# the creatives advertiser-filter endpoint.
VOODOO_PUBLISHER_NAME_VARIANTS: tuple[str, ...] = (
    "voodoo",
    "voodoo sas",
    "voodoo.io",
)

SEARCH_LIMIT = 10
DEFAULT_COUNTRY = "US"

# URL length keeps us below typical 8 KB limits.
UNIFIED_BATCH_SIZE = 100  # 24-char hex IDs → ~2.5 KB per chunk
IOS_BATCH_SIZE = 100      # 9-10 digit IDs → ~1 KB per chunk


# ---------------------------------------------------------------------------
# Step 1: discover the Voodoo publisher dossier
# ---------------------------------------------------------------------------


def _is_official_voodoo(entry: dict[str, Any]) -> bool:
    """Return True only for the canonical Voodoo publisher entity."""
    if entry.get("publisher_id") == VOODOO_PUBLISHER_ID:
        return True
    name = (entry.get("publisher_name") or entry.get("name") or "").strip()
    return name == VOODOO_PUBLISHER_NAME


def _fetch_voodoo_publisher() -> dict[str, Any] | None:
    """Fetch the Voodoo publisher dossier (with ``unified_apps[]``)."""
    params = {
        "entity_type": "publisher",
        "term": VOODOO_PUBLISHER_NAME,
        "limit": SEARCH_LIMIT,
    }
    raw = disk_cached(
        SENSORTOWER_CACHE_DIR,
        "search_publisher_voodoo",
        params,
        lambda: _get("/v1/unified/search_entities", params),
    )

    candidates: list[dict[str, Any]] = (
        raw if isinstance(raw, list) else raw.get("apps") or raw.get("publishers") or []
    )

    for entry in candidates:
        if _is_official_voodoo(entry):
            unified_apps = entry.get("unified_apps") or []
            log.info(
                "Voodoo publisher located (id=%s, %d unified apps)",
                entry.get("publisher_id"),
                len(unified_apps),
            )
            return entry

    log.warning(
        "No canonical Voodoo publisher in %d candidates. Names seen: %s",
        len(candidates),
        [c.get("publisher_name") for c in candidates],
    )
    return None


# ---------------------------------------------------------------------------
# Step 2: unified app IDs → iTunes app IDs
# ---------------------------------------------------------------------------


def _chunked(seq: list[str], size: int) -> list[list[str]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def _fetch_unified_chunk(unified_ids: list[str]) -> list[dict[str, Any]]:
    csv_ids = ",".join(unified_ids)
    params = {"app_ids": csv_ids, "app_id_type": "unified"}
    resp = disk_cached(
        SENSORTOWER_CACHE_DIR,
        f"unified_apps_voodoo_{len(unified_ids)}",
        params,
        lambda: _get("/v1/unified/apps", params),
    )
    return resp.get("apps") or []


def _resolve_unified_to_itunes(
    unified_ids: list[str],
) -> dict[str, str]:
    """Return ``{unified_app_id: itunes_app_id}`` for apps with an iOS variant."""
    mapping: dict[str, str] = {}
    chunks = _chunked(unified_ids, UNIFIED_BATCH_SIZE)
    log.info(
        "Resolving %d unified IDs → iTunes IDs in %d chunks",
        len(unified_ids),
        len(chunks),
    )
    for chunk in chunks:
        apps = _fetch_unified_chunk(chunk)
        for app in apps:
            unified_id = str(app.get("unified_app_id") or "")
            itunes_apps = app.get("itunes_apps") or []
            if not unified_id or not itunes_apps:
                continue
            ios_id = itunes_apps[0].get("app_id")
            if ios_id is None:
                continue
            mapping[unified_id] = str(ios_id)
    return mapping


# ---------------------------------------------------------------------------
# Step 3: rich iOS metadata
# ---------------------------------------------------------------------------


def _fetch_ios_chunk(
    itunes_ids: list[str], *, country: str
) -> list[dict[str, Any]]:
    csv_ids = ",".join(itunes_ids)
    params = {"app_ids": csv_ids, "country": country}
    resp = disk_cached(
        SENSORTOWER_CACHE_DIR,
        f"ios_apps_voodoo_{country}_{len(itunes_ids)}",
        params,
        lambda: _get("/v1/ios/apps", params),
    )
    return resp.get("apps") or []


def _fetch_ios_metadata(
    itunes_ids: list[str], *, country: str = DEFAULT_COUNTRY
) -> dict[str, dict[str, Any]]:
    """Return ``{itunes_app_id: meta_dict}`` for the supplied IDs."""
    if not itunes_ids:
        return {}

    out: dict[str, dict[str, Any]] = {}
    chunks = _chunked(itunes_ids, IOS_BATCH_SIZE)
    log.info(
        "Fetching iOS metadata for %d apps in %d chunks (country=%s)",
        len(itunes_ids),
        len(chunks),
        country,
    )
    for chunk in chunks:
        apps = _fetch_ios_chunk(chunk, country=country)
        for meta in apps:
            aid = meta.get("app_id")
            if aid is None:
                continue
            out[str(aid)] = meta
    return out


# ---------------------------------------------------------------------------
# Step 4: assembly
# ---------------------------------------------------------------------------


def _build_app_metadata(
    *, unified_id: str, ios_id: str, meta: dict[str, Any]
) -> AppMetadata | None:
    """Combine unified ID + iOS meta → :class:`AppMetadata`."""
    try:
        return AppMetadata(
            app_id=str(meta["app_id"]),
            unified_app_id=unified_id,
            name=meta["name"],
            publisher_name=meta.get("publisher_name") or VOODOO_PUBLISHER_NAME,
            icon_url=meta["icon_url"],
            categories=meta.get("categories", []) or [],
            description=meta.get("description") or "",
            screenshot_urls=meta.get("screenshot_urls", []) or [],
            rating=meta.get("rating"),
            rating_count=meta.get("rating_count"),
        )
    except (KeyError, ValidationError) as exc:
        log.debug(
            "Skipping Voodoo app ios_id=%s unified=%s: %s",
            ios_id,
            unified_id,
            exc,
        )
        return None


def _sort_catalog(catalog: list[AppMetadata]) -> list[AppMetadata]:
    """Sort by rating_count desc, then name asc — drives the UI pick-list order."""
    return sorted(
        catalog,
        key=lambda m: (-(m.rating_count or 0), m.name.casefold()),
    )


# ---------------------------------------------------------------------------
# Catalog snapshot (the user-facing 7-day disk cache)
# ---------------------------------------------------------------------------


def _catalog_path() -> Path:
    return VOODOO_CACHE_DIR / CATALOG_FILENAME


def _load_cached_catalog() -> list[AppMetadata] | None:
    path = _catalog_path()
    if not path.exists():
        return None

    age_s = time.time() - path.stat().st_mtime
    if age_s > CATALOG_TTL_SECONDS:
        log.info(
            "Voodoo catalog snapshot is stale (%.1f days old), refreshing",
            age_s / 86400,
        )
        return None

    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError:
        log.warning("Voodoo catalog snapshot is corrupted, refreshing")
        return None

    parsed: list[AppMetadata] = []
    for entry in raw:
        try:
            parsed.append(AppMetadata.model_validate(entry))
        except ValidationError:
            log.warning("Dropping invalid cached entry for app %s", entry.get("app_id"))
            continue
    return parsed


def _persist_catalog(catalog: list[AppMetadata]) -> None:
    path = _catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [m.model_dump(mode="json") for m in catalog]
    path.write_text(json.dumps(payload, indent=2))
    log.info("Wrote Voodoo catalog snapshot (%d apps) to %s", len(catalog), path)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def fetch_voodoo_catalog(*, refresh: bool = False) -> list[AppMetadata]:
    """Return the full list of Voodoo-published mobile games (iOS).

    Cached on disk under ``data/cache/voodoo/catalog.json``. Subsequent calls
    within the 7-day TTL are instant and hit zero APIs. Pass ``refresh=True``
    to force a re-fetch (still bounded to one publisher search, plus chunked
    unified→iTunes mapping and chunked iOS metadata batches — every chunk
    independently disk-cached).

    The returned list is sorted by ``rating_count`` desc (then name) so the
    most popular Voodoo titles surface first in the UI.
    """
    if not refresh:
        cached = _load_cached_catalog()
        if cached is not None:
            log.debug("Voodoo catalog cache hit (%d apps)", len(cached))
            return cached

    log.info("CACHE MISS for Voodoo catalog — querying SensorTower")

    publisher = _fetch_voodoo_publisher()
    if publisher is None:
        log.warning("Voodoo publisher entity not found; returning empty catalog.")
        return []

    unified_ids = [str(uid) for uid in (publisher.get("unified_apps") or [])]
    if not unified_ids:
        log.warning("Voodoo publisher has no unified_apps entries.")
        return []

    unified_to_itunes = _resolve_unified_to_itunes(unified_ids)
    if not unified_to_itunes:
        log.warning("No iTunes app IDs resolved from %d unified IDs.", len(unified_ids))
        return []

    itunes_to_unified = {ios_id: u for u, ios_id in unified_to_itunes.items()}
    meta_by_id = _fetch_ios_metadata(list(itunes_to_unified.keys()))

    catalog: list[AppMetadata] = []
    for ios_id, meta in meta_by_id.items():
        unified_id = itunes_to_unified.get(ios_id, "")
        am = _build_app_metadata(unified_id=unified_id, ios_id=ios_id, meta=meta)
        if am is not None:
            catalog.append(am)

    catalog = _sort_catalog(catalog)
    log.info(
        "Voodoo catalog assembled: %d apps (from %d unified IDs)",
        len(catalog),
        len(unified_ids),
    )

    if catalog:
        _persist_catalog(catalog)

    return catalog


__all__ = [
    "fetch_voodoo_catalog",
    "VOODOO_PUBLISHER_ID",
    "VOODOO_PUBLISHER_NAME",
    "VOODOO_PUBLISHER_NAME_VARIANTS",
    "VOODOO_CACHE_DIR",
]
