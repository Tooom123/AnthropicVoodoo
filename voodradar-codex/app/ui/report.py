"""Streamlit rendering helpers for HookLens reports."""

from __future__ import annotations

from pathlib import Path

import streamlit as st

from app.models import HookLensReport


def render_report(report: HookLensReport) -> None:
    """Render a HookLens report in Streamlit."""
    st.title("HookLens")
    st.caption("Fixture-backed end-to-end prototype for Voodoo Hack Track 3")

    col_1, col_2, col_3, col_4 = st.columns(4)
    col_1.metric("Creatives", report.market_context.num_creatives_analyzed)
    col_2.metric("Archetypes", len(report.top_archetypes))
    col_3.metric("Variants", len(report.final_variants))
    col_4.metric("Runtime", f"{report.pipeline_duration_seconds:.2f}s")

    st.subheader("Target Game DNA")
    st.markdown(f"**Game:** {report.target_game.name}")
    st.markdown(f"**Core loop:** {report.target_game.core_loop}")
    st.markdown(f"**Audience:** {report.target_game.audience_proxy}")
    st.markdown(f"**Visual style:** {report.target_game.visual_style}")
    st.markdown(
        "**Palette:** "
        f"{report.target_game.palette.primary_hex}, "
        f"{report.target_game.palette.secondary_hex}, "
        f"{report.target_game.palette.accent_hex}"
    )
    st.markdown(
        "**Mechanics:** " + ", ".join(report.target_game.key_mechanics)
    )

    st.subheader("Top Archetypes")
    st.table(
        [
            {
                "label": archetype.label,
                "velocity": archetype.velocity_score,
                "derivative": archetype.derivative_spread,
                "freshness_days": archetype.freshness_days,
                "signal": archetype.overall_signal_score,
            }
            for archetype in report.top_archetypes
        ]
    )

    st.subheader("Game Fit")
    st.table(
        [
            {
                "archetype_id": score.archetype_id,
                "visual": score.visual_match,
                "mechanic": score.mechanic_match,
                "audience": score.audience_match,
                "overall": score.overall,
            }
            for score in report.game_fit_scores
        ]
    )

    st.subheader("Final Variants")
    for variant in report.final_variants:
        with st.container(border=True):
            st.markdown(
                f"**Priority #{variant.test_priority}: {variant.brief.title}**"
            )
            st.markdown(variant.test_priority_rationale)
            st.markdown(f"**Hook:** {variant.brief.hook_3s}")
            st.markdown(f"**Visual direction:** {variant.brief.visual_direction}")
            st.markdown("**Scene flow:**")
            for scene in variant.brief.scene_flow:
                st.markdown(f"- {scene}")

            if Path(variant.hero_frame_path).exists():
                st.image(variant.hero_frame_path, caption="Hero frame")

            existing_storyboards = [
                path for path in variant.storyboard_paths if Path(path).exists()
            ]
            if existing_storyboards:
                st.image(existing_storyboards, caption=["Storyboard 1", "Storyboard 2"])

