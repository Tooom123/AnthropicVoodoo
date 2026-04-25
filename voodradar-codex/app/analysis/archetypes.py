"""Creative archetype clustering and market signal scoring."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean

from app.cache import slugify
from app.models import CreativeArchetype, DeconstructedCreative

COMMON_MECHANICS = {
    "asmr-sort": ["sorting", "cleanup", "precision"],
    "fail-rescue": ["rescue", "space-management", "problem-solving"],
    "transformation-upgrade": ["upgrading", "merging", "transformation"],
}

LABELS = {
    "asmr-sort": "ASMR Sort Cleanup",
    "fail-rescue": "Fail-to-Win Rescue",
    "transformation-upgrade": "Transformation Upgrade",
}


def _cluster_key(creative: DeconstructedCreative) -> str:
    group = creative.raw.phashion_group
    if group:
        return group
    return slugify(f"{creative.hook.emotional_pitch}-{creative.visual_style}")


def compute_archetypes(
    creatives: list[DeconstructedCreative],
) -> list[CreativeArchetype]:
    """Group creatives into archetypes and score their market signal."""
    now = datetime.now(timezone.utc)
    clusters: dict[str, list[DeconstructedCreative]] = defaultdict(list)
    for creative in creatives:
        clusters[_cluster_key(creative)].append(creative)

    archetypes: list[CreativeArchetype] = []
    for cluster_id, members in clusters.items():
        if not members:
            continue

        ages = [(now - member.raw.first_seen_at).days for member in members]
        freshness_days = mean(ages) if ages else 30.0
        freshness_signal = min(2.5, 30 / max(freshness_days, 1))

        shares = [member.raw.share or 0.05 for member in members]
        mean_share = mean(shares)
        freshness_norm = max(freshness_days, 1) / 30
        velocity_score = max(0.5, min(2.5, (mean_share * 4) / freshness_norm))

        unique_advertisers = {member.raw.advertiser_name for member in members}
        derivative_spread = len(unique_advertisers) / max(len(members), 1)

        centroid = max(members, key=lambda member: member.raw.share or 0.0)
        overall_signal_score = (
            0.4 * velocity_score
            + 0.35 * derivative_spread
            + 0.25 * freshness_signal
        )

        archetypes.append(
            CreativeArchetype(
                archetype_id=cluster_id,
                label=LABELS.get(cluster_id, centroid.hook.summary[:40]),
                member_creative_ids=[member.raw.creative_id for member in members],
                centroid_hook=centroid.hook,
                palette_hex=centroid.palette_hex,
                common_mechanics=COMMON_MECHANICS.get(cluster_id, ["matching"]),
                velocity_score=round(velocity_score, 3),
                derivative_spread=round(derivative_spread, 3),
                freshness_days=round(freshness_days, 1),
                overall_signal_score=round(overall_signal_score, 3),
                rationale=(
                    f"{len(members)} creatives, {len(unique_advertisers)} advertisers, "
                    f"avg age {freshness_days:.0f}d, avg share {mean_share:.2f}. "
                    f"This pattern is moving because it combines readability with a "
                    "clear first-payoff beat."
                ),
            )
        )

    archetypes.sort(key=lambda item: item.overall_signal_score, reverse=True)
    return archetypes

