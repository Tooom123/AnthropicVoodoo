"""Pre-cache the top-N Voodoo games' SensorTower ad creatives.

Usage::

    # Default: top 15 by rating_count, US, max 5-ad sample per app
    uv run python -m scripts.precache_voodoo_ads

    # Custom N
    uv run python -m scripts.precache_voodoo_ads --limit 25

    # Different country
    uv run python -m scripts.precache_voodoo_ads --country GB

    # Force a refresh — drops every selected app's existing creatives cache file
    uv run python -m scripts.precache_voodoo_ads --refresh

What it does
------------

1. Loads the cached Voodoo catalog (``fetch_voodoo_catalog``).
2. Filters out non-game apps (e.g. BeReal) using the iOS App Store game
   category IDs (consistent with the front-end's quick-pick filter).
3. Sorts by ``rating_count`` desc and picks the top N.
4. Sequentially calls ``fetch_voodoo_app_creatives`` for each (be polite to
   SensorTower — no parallelism).
5. Writes an aggregate summary to
   ``data/cache/voodoo/portfolio_summary.json``.

That summary is what the demo's ``/api/voodoo/portfolio`` endpoint reads
first, so the Voodoo Portfolio page renders instantly from disk without a
15-call SensorTower fan-out.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv

load_dotenv(REPO_ROOT / ".env")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
# httpx logs every request URL at INFO and leaks the SensorTower auth_token
# query param. Keep it on WARNING in this CLI too.
logging.getLogger("httpx").setLevel(logging.WARNING)

log = logging.getLogger(__name__)

from app.models import AppMetadata
from app.sources.voodoo import (
    VOODOO_CACHE_DIR,
    fetch_voodoo_app_creatives,
    fetch_voodoo_catalog,
)

# iOS App Store game category IDs (mirrors front/src/components/insights/
# LaunchAnalysisModal.tsx so server-side precache and client-side quick-pick
# agree on which Voodoo entries count as a "mobile game" for the demo).
IOS_GAME_CATEGORY_IDS: frozenset[int] = frozenset(
    {6014, 7001, 7002, 7003, 7004, 7005, 7006, 7009, 7011, 7012, 7013, 7014,
     7015, 7016, 7017, 7018, 7019}
)

DEFAULT_LIMIT = 15
DEFAULT_COUNTRY = "US"
DEFAULT_PER_APP_AD_LIMIT = 20  # what we ask SensorTower for per app
SAMPLE_SIZE = 5  # ad units kept in the summary's per-app preview

SUMMARY_PATH: Path = VOODOO_CACHE_DIR / "portfolio_summary.json"
ADVERTISER_CACHE_DIR: Path = VOODOO_CACHE_DIR / "advertiser_creatives"

# Display short-names so the per-app one-liner stays compact.
NETWORK_SHORT: dict[str, str] = {
    "Facebook": "FB",
    "Instagram": "IG",
    "TikTok": "TikTok",
    "Youtube": "YT",
    "Unity": "Unity",
    "Admob": "Admob",
    "Applovin": "AppLovin",
}


def _is_game(meta: AppMetadata) -> bool:
    """True iff the app declares any iOS Game category."""
    for cat in meta.categories or []:
        try:
            if int(cat) in IOS_GAME_CATEGORY_IDS:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _drop_advertiser_cache_for(unified_app_id: str, country: str) -> int:
    """Delete every disk-cached creatives JSON for ``(unified_app_id, country)``.

    Returns the number of files removed. Used by ``--refresh`` to force a
    fresh SensorTower roundtrip without nuking the catalog or the other apps'
    cached creatives.
    """
    if not unified_app_id:
        return 0
    if not ADVERTISER_CACHE_DIR.exists():
        return 0
    removed = 0
    for path in ADVERTISER_CACHE_DIR.glob(f"{unified_app_id}_{country}_*.json"):
        try:
            path.unlink()
            removed += 1
        except OSError:
            log.warning("Could not unlink stale cache file %s", path)
    return removed


def _sort_ads_by_recency(ads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Stable sort: most recent ``first_seen_at`` first; missing dates last."""
    def key(ad: dict[str, Any]) -> tuple[int, str]:
        fs = ad.get("first_seen_at") or ""
        return (0, fs) if fs else (1, "")
    return sorted(ads, key=key, reverse=True)


def _network_mix(ads: list[dict[str, Any]]) -> dict[str, int]:
    mix: dict[str, int] = {}
    for ad in ads:
        net = ad.get("network") or "Unknown"
        mix[net] = mix.get(net, 0) + 1
    return dict(sorted(mix.items(), key=lambda kv: (-kv[1], kv[0])))


def _format_mix_short(mix: dict[str, int]) -> str:
    if not mix:
        return ""
    parts = [f"{NETWORK_SHORT.get(net, net)} {n}" for net, n in mix.items()]
    return " · ".join(parts)


def _build_app_entry(
    meta: AppMetadata,
    ads: list[dict[str, Any]],
) -> dict[str, Any]:
    sorted_ads = _sort_ads_by_recency(ads)
    sample_keys = (
        "creative_id",
        "network",
        "ad_type",
        "thumb_url",
        "creative_url",
        "first_seen_at",
    )
    sample = [
        {k: ad.get(k) for k in sample_keys} for ad in sorted_ads[:SAMPLE_SIZE]
    ]
    latest = sorted_ads[0].get("first_seen_at") if sorted_ads else None
    return {
        "app_id": meta.app_id,
        "unified_app_id": meta.unified_app_id,
        "name": meta.name,
        "publisher_name": meta.publisher_name,
        "icon_url": meta.icon_url,
        "categories": list(meta.categories or []),
        "rating": meta.rating,
        "rating_count": meta.rating_count,
        "description": meta.description or "",
        "ads_total": len(sorted_ads),
        "ads_by_network": _network_mix(sorted_ads),
        "ads_latest_first_seen": latest,
        "ads_sample": sample,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Top-N games to precache (default {DEFAULT_LIMIT})",
    )
    parser.add_argument(
        "--country",
        default=DEFAULT_COUNTRY,
        help=f"SensorTower country code for ad activity (default {DEFAULT_COUNTRY})",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Drop each selected app's existing creatives cache file before fetching",
    )
    parser.add_argument(
        "--per-app-limit",
        type=int,
        default=DEFAULT_PER_APP_AD_LIMIT,
        help=f"Max ad_units to request per app (default {DEFAULT_PER_APP_AD_LIMIT})",
    )
    parser.add_argument(
        "--sleep-between",
        type=float,
        default=0.0,
        help="Optional sleep (s) between SensorTower calls if you want a softer rate",
    )
    args = parser.parse_args()

    catalog = fetch_voodoo_catalog()
    if not catalog:
        log.error("Voodoo catalog is empty — cannot precache.")
        return 1

    games = [m for m in catalog if _is_game(m)]
    games.sort(key=lambda m: (-(m.rating_count or 0), m.name.casefold()))
    selected = games[: args.limit]

    log.info(
        "Catalog: %d apps total, %d games after filter, picking top %d",
        len(catalog),
        len(games),
        len(selected),
    )

    rows: list[tuple[AppMetadata, list[dict[str, Any]], bool, str | None]] = []
    total_ads = 0
    for idx, meta in enumerate(selected, 1):
        if args.refresh:
            dropped = _drop_advertiser_cache_for(meta.unified_app_id, args.country)
            if dropped:
                log.info("--refresh: dropped %d cached file(s) for %s", dropped, meta.name)

        log.info(
            "[%d/%d] %s (rating_count=%s) → fetching creatives",
            idx,
            len(selected),
            meta.name,
            meta.rating_count,
        )
        err: str | None = None
        ads: list[dict[str, Any]] = []
        try:
            ads = fetch_voodoo_app_creatives(
                meta.app_id,
                country=args.country,
                limit=args.per_app_limit,
            )
        except Exception as exc:  # noqa: BLE001
            err = repr(exc)
            log.exception("Failed to fetch creatives for %s — continuing", meta.name)

        ok = err is None
        rows.append((meta, ads, ok, err))
        total_ads += len(ads)

        if args.sleep_between and idx < len(selected):
            time.sleep(args.sleep_between)

    summary = {
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "country": args.country,
        "limit": args.limit,
        "apps": [_build_app_entry(meta, ads) for meta, ads, _, _ in rows],
    }

    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, default=str))

    summary_kb = SUMMARY_PATH.stat().st_size / 1024.0

    print()
    print("=" * 70)
    print(
        f"DONE — {len(rows)} apps cached · {total_ads} ad units total · "
        f"{summary_kb:.2f} KB summary"
    )
    print("=" * 70)
    for meta, ads, ok, err in rows:
        marker = "✓" if ok and ads else "✗" if not ok else "✓"
        name = meta.name[:38].ljust(38)
        if not ok:
            print(f"  ✗ {name}  ERROR: {err}")
            continue
        if not ads:
            print(f"  ✗ {name}   0 ads   (no recent activity, skipping)")
            continue
        mix = _format_mix_short(_network_mix(ads))
        print(f"  {marker} {name}  {len(ads):>3} ads   ({mix})")
    print(f"\nWrote {SUMMARY_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
