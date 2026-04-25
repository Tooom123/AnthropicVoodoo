"""Cluster deconstructed creatives into archetypes + compute non-obvious signals.

Three signals (the differentiator vs other teams):

- **velocity_score**: with a small sample we proxy as ``1 / freshness_norm``.
  In production with full historical share data, replace with an actual share
  trend ratio (last_week / 3_weeks_ago).
- **derivative_spread**: unique advertisers / number of creatives in cluster.
  Higher = more publishers copying the hook = stronger market validation.
- **freshness_days**: mean age of member creatives.
- **overall_signal_score**: weighted composite ``0.4·v + 0.35·d + 0.25·1/f``.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean

from app.models import CreativeArchetype, DeconstructedCreative


def _slugify(*parts: str) -> str:
    return "-".join(p.lower().replace(" ", "_").replace("/", "-")[:20] for p in parts)


def _ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def compute_archetypes(
    deconstructed: list[DeconstructedCreative],
    *,
    now: datetime | None = None,
) -> list[CreativeArchetype]:
    """Group by ``(emotional_pitch, visual_style)`` and compute signals.

    Returns archetypes sorted by ``overall_signal_score`` desc.
    """
    if not deconstructed:
        return []

    now = now or datetime.now(timezone.utc)

    clusters: dict[tuple[str, str], list[DeconstructedCreative]] = defaultdict(list)
    for d in deconstructed:
        clusters[(d.hook.emotional_pitch, d.visual_style)].append(d)

    archetypes: list[CreativeArchetype] = []
    for (pitch, vstyle), members in clusters.items():
        if not members:
            continue

        ages = [(now - _ensure_aware(m.raw.first_seen_at)).days for m in members]
        freshness = mean(ages)
        freshness_norm = max(freshness, 1.0) / 30.0  # "1 = ~one month old"

        unique_advertisers = {m.raw.advertiser_name for m in members}
        derivative_spread = len(unique_advertisers) / max(len(members), 1)

        # Velocity proxy — fresher = more "rising". Replace with real share
        # trend ratio when we have multi-period data per phashion_group.
        velocity = min(2.0, 1.0 / freshness_norm) if freshness_norm > 0 else 1.0

        overall = (
            0.4 * velocity
            + 0.35 * derivative_spread
            + 0.25 * (1.0 / freshness_norm)
        )

        # Centroid hook — share-weighted "ideal" representative.
        centroid = max(members, key=lambda m: m.raw.share or 0.0)

        rationale = (
            f"{len(members)} creatives across {len(unique_advertisers)} unique "
            f"advertisers, average age {freshness:.0f}d. Hook representative: "
            f'"{centroid.hook.summary[:80]}"'
        )

        archetypes.append(
            CreativeArchetype(
                archetype_id=_slugify(pitch, vstyle),
                label=f"{pitch.replace('_', ' ').title()} · {vstyle}",
                member_creative_ids=[m.raw.creative_id for m in members],
                centroid_hook=centroid.hook,
                palette_hex=centroid.palette_hex,
                common_mechanics=[],
                velocity_score=round(velocity, 3),
                derivative_spread=round(derivative_spread, 3),
                freshness_days=round(freshness, 1),
                overall_signal_score=round(overall, 3),
                rationale=rationale,
            )
        )

    archetypes.sort(key=lambda a: a.overall_signal_score, reverse=True)
    return archetypes
