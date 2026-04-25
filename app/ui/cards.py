"""Streamlit render helpers for HookLens.

Each ``render_*`` function takes a domain object from ``app.models`` and
draws a clean Streamlit block. Keeping this here means the UI can be
reused/replaced without touching the pipeline.
"""

from __future__ import annotations

import streamlit as st

from app.models import (
    AppMetadata,
    CreativeArchetype,
    DeconstructedCreative,
    GameDNA,
    GameFitScore,
    GeneratedVariant,
    HookLensReport,
    RawCreative,
)


def render_app_metadata(meta: AppMetadata) -> None:
    cols = st.columns([1, 4])
    with cols[0]:
        st.image(str(meta.icon_url), width=96)
    with cols[1]:
        st.markdown(f"**{meta.name}**  ·  by *{meta.publisher_name}*")
        st.caption(
            f"unified_app_id: `{meta.unified_app_id}`  ·  "
            f"app_id: `{meta.app_id}`  ·  "
            f"rating: {meta.rating or '—'} ({meta.rating_count or 0} ratings)"
        )
        if meta.description:
            with st.expander("Store description"):
                st.write(meta.description)


def _palette_swatch(hex_color: str, label: str) -> str:
    return (
        f'<div style="display:inline-block;width:48px;height:48px;'
        f'background:{hex_color};border-radius:8px;margin-right:8px;'
        f'border:1px solid #00000022"></div>'
        f'<div style="display:inline-block;vertical-align:top;font-size:0.85em;color:#666">'
        f'{label}<br><code>{hex_color}</code></div>'
    )


def render_game_dna(dna: GameDNA) -> None:
    cols = st.columns(2)
    with cols[0]:
        st.markdown("**Genre**  \n" + (f"`{dna.genre}` · `{dna.sub_genre}`" if dna.sub_genre else f"`{dna.genre}`"))
        st.markdown("**Audience**  \n" + dna.audience_proxy)
        st.markdown("**Visual style**  \n" + dna.visual_style)
        st.markdown("**UI mood**  \n" + dna.ui_mood)
    with cols[1]:
        st.markdown("**Palette**")
        st.markdown(
            _palette_swatch(dna.palette.primary_hex, "Primary")
            + _palette_swatch(dna.palette.secondary_hex, "Secondary")
            + _palette_swatch(dna.palette.accent_hex, "Accent"),
            unsafe_allow_html=True,
        )
        st.caption(dna.palette.description)
        st.markdown("**Mechanics**")
        st.markdown(" ".join(f"`{m}`" for m in dna.key_mechanics))

    st.markdown(f"> **Core loop:** _{dna.core_loop}_")

    if dna.screenshot_signals:
        with st.expander("Vision observations from screenshots"):
            for sig in dna.screenshot_signals:
                st.write(f"- {sig}")


def render_top_advertisers_table(advertisers: list[dict]) -> None:
    rows = []
    for i, a in enumerate(advertisers, start=1):
        rows.append(
            {
                "#": i,
                "Advertiser": a.get("name", "?"),
                "Publisher": a.get("publisher_name", "?"),
                "SoV": round(a.get("sov", 0) or 0, 4),
                "app_id": str(a.get("app_id") or a.get("id", "?")),
            }
        )
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_raw_creatives_table(raw: list[RawCreative]) -> None:
    rows = []
    for i, rc in enumerate(raw, start=1):
        rows.append(
            {
                "#": i,
                "Advertiser": rc.advertiser_name,
                "Network": rc.network,
                "Phash": (rc.phashion_group or "—")[:8],
                "Share": round(rc.share or 0, 4),
                "Dur (s)": rc.video_duration or 0,
                "Message": (rc.message or "")[:60],
                "CTA": rc.button_text or "—",
            }
        )
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_deconstructed_table(deconstructed: list[DeconstructedCreative]) -> None:
    rows = []
    for i, d in enumerate(deconstructed, start=1):
        rows.append(
            {
                "#": i,
                "Advertiser": d.raw.advertiser_name,
                "Hook (3s)": d.hook.summary[:80],
                "Pitch": d.hook.emotional_pitch,
                "Visual": d.visual_style,
                "CTA": d.cta_text or "—",
            }
        )
    st.dataframe(rows, use_container_width=True, hide_index=True)


def render_archetype_card(arch: CreativeArchetype) -> None:
    with st.container(border=True):
        cols = st.columns([3, 1, 1, 1, 1])
        cols[0].markdown(f"**{arch.label}**  \n_{len(arch.member_creative_ids)} creatives_")
        cols[1].metric("Velocity", f"{arch.velocity_score:.2f}")
        cols[2].metric("Derivative", f"{arch.derivative_spread:.2f}")
        cols[3].metric("Freshness", f"{arch.freshness_days:.0f}d")
        cols[4].metric("Score", f"{arch.overall_signal_score:.2f}")
        st.caption(arch.rationale)
        if arch.palette_hex:
            st.markdown(
                "".join(
                    f'<span style="display:inline-block;width:20px;height:20px;'
                    f'background:{c};border-radius:4px;margin-right:4px"></span>'
                    for c in arch.palette_hex
                ),
                unsafe_allow_html=True,
            )


def render_fit_score_row(arch: CreativeArchetype, sc: GameFitScore) -> None:
    with st.container(border=True):
        cols = st.columns([3, 1, 1, 1, 1])
        cols[0].markdown(f"**{arch.label}**")
        cols[1].metric("Visual", sc.visual_match)
        cols[2].metric("Mechanic", sc.mechanic_match)
        cols[3].metric("Audience", sc.audience_match)
        cols[4].metric("Overall", sc.overall)
        st.caption(sc.rationale)


def render_variant_card(variant: GeneratedVariant) -> None:
    with st.container(border=True):
        cols = st.columns([2, 3])
        with cols[0]:
            if variant.hero_frame_path:
                st.image(variant.hero_frame_path, use_container_width=True)
            if variant.storyboard_paths:
                st.caption("Storyboard")
                tcols = st.columns(len(variant.storyboard_paths))
                for tc, path in zip(tcols, variant.storyboard_paths, strict=True):
                    with tc:
                        st.image(path, use_container_width=True)
        with cols[1]:
            st.markdown(f"### {variant.brief.title}")
            st.markdown(f"**Test priority #{variant.test_priority}**")
            st.caption(variant.test_priority_rationale)

            st.markdown("**Hook (first 3s)**")
            st.info(variant.brief.hook_3s)

            st.markdown("**Scene flow**")
            for i, beat in enumerate(variant.brief.scene_flow, start=1):
                st.write(f"{i}. {beat}")

            st.markdown(f"**CTA:** :violet-badge[{variant.brief.cta}]")

            with st.expander("Full brief & rationale"):
                st.markdown(f"**Visual direction:** {variant.brief.visual_direction}")
                st.markdown("**Text overlays:**")
                for ov in variant.brief.text_overlays:
                    st.write(f"- {ov}")
                st.markdown("**Rationale:**")
                st.write(variant.brief.rationale)
                st.markdown("**Scenario prompts:**")
                for p in variant.brief.scenario_prompts:
                    st.code(p, language="text")

            st.download_button(
                "Download brief (JSON)",
                data=variant.brief.model_dump_json(indent=2),
                file_name=f"brief_{variant.brief.archetype_id}.json",
                mime="application/json",
                key=f"dl_brief_{variant.brief.archetype_id}",
            )


def render_pitch_story(report: HookLensReport, network: str) -> None:
    """Auto-generated French pitch paragraph using real numbers from the run."""
    if not report.top_archetypes or not report.final_variants:
        st.warning("Pas assez de données pour générer le pitch.")
        return

    ctx = report.market_context
    top = report.top_archetypes[0]
    chosen_variant = report.final_variants[0]
    chosen_fit = next(
        (s for s in report.game_fit_scores if s.archetype_id == chosen_variant.brief.archetype_id),
        None,
    )

    st.markdown(
        f"""
> Sur **{report.target_game.name}**, on a scanné **{ctx.num_advertisers_scanned} advertisers** Puzzle sur {network} ({ctx.countries[0]}) sur la période, et déconstruit **{ctx.num_creatives_analyzed} creatives** via Gemini 2.5 Pro.
>
> Le breakout du moment est **« {top.label} »** : {len(top.member_creative_ids)} creatives, {int(top.derivative_spread * 100)}% d'advertisers uniques, âge moyen **{top.freshness_days:.0f} jours** — c'est le hook qui se fait copier en ce moment, pas un hit établi.
>
> On a scoré ce hook contre la Game DNA de **{report.target_game.name}** avec Claude Opus 4.7 → **{chosen_fit.overall if chosen_fit else '—'}/100** (visual={chosen_fit.visual_match if chosen_fit else '—'}, mechanic={chosen_fit.mechanic_match if chosen_fit else '—'}, audience={chosen_fit.audience_match if chosen_fit else '—'}). Voici la creative tailored qu'on a générée avec Scenario : **« {chosen_variant.brief.title} »** — palette `{report.target_game.palette.primary_hex}`/`{report.target_game.palette.secondary_hex}`, CTA **« {chosen_variant.brief.cta} »**.
>
> Test priority #1, prête pour Meta Ads / TikTok lundi matin.
"""
    )
