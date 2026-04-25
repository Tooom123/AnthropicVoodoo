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

    # Show all available screenshots so we see exactly what Gemini Vision will get
    if meta.screenshot_urls:
        st.markdown(
            f"**Store screenshots** _(top 3 fed to Gemini Vision · "
            f"{len(meta.screenshot_urls)} total available)_"
        )
        # Show up to 6 screenshots in a grid for context
        urls = [str(u) for u in meta.screenshot_urls[:6]]
        scols = st.columns(min(len(urls), 6))
        for sc, url in zip(scols, urls, strict=False):
            with sc:
                st.image(url, use_container_width=True)


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
        app_id = str(a.get("app_id") or a.get("id", "?"))
        rows.append(
            {
                "#": i,
                "Icon": a.get("icon_url"),  # rendered as ImageColumn below
                "Advertiser": a.get("name", "?"),
                "Publisher": a.get("publisher_name", "?"),
                "SoV": round(a.get("sov", 0) or 0, 4),
                "app_id": app_id,
                "App Store": (
                    f"https://apps.apple.com/app/id{app_id}"
                    if app_id.isdigit()
                    else None
                ),
            }
        )
    st.dataframe(
        rows,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Icon": st.column_config.ImageColumn("Icon", width="small"),
            "App Store": st.column_config.LinkColumn(
                "Store",
                display_text="Open",
                width="small",
            ),
            "SoV": st.column_config.NumberColumn(
                "SoV",
                help="Share of Voice — fraction of total ad spend this advertiser captured in the period",
                format="%.4f",
            ),
        },
    )


def render_raw_creatives_table(raw: list[RawCreative]) -> None:
    rows = []
    for i, rc in enumerate(raw, start=1):
        rows.append(
            {
                "#": i,
                "Thumb": str(rc.thumb_url) if rc.thumb_url else None,
                "Advertiser": rc.advertiser_name,
                "Network": rc.network,
                "Phash": (rc.phashion_group or "—")[:8],
                "Share": round(rc.share or 0, 4),
                "Dur (s)": round(rc.video_duration or 0, 1),
                "Message": (rc.message or "")[:60],
                "CTA": rc.button_text or "—",
                "Video": str(rc.creative_url),
            }
        )
    st.dataframe(
        rows,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Thumb": st.column_config.ImageColumn("Thumb", width="small"),
            "Video": st.column_config.LinkColumn(
                "Video",
                display_text="▶ Open",
                width="small",
                help="Direct mp4 URL on SensorTower's S3 bucket",
            ),
            "Share": st.column_config.NumberColumn("Share", format="%.4f"),
            "Phash": st.column_config.TextColumn(
                "Phash",
                help="phashion_group — perceptual hash. Same value across advertisers means visual derivatives.",
            ),
        },
    )


def render_deconstructed_table(deconstructed: list[DeconstructedCreative]) -> None:
    rows = []
    for i, d in enumerate(deconstructed, start=1):
        # 3-color palette swatch as a single string of inline SVG-ish blocks
        # (st.dataframe doesn't support HTML in cells, so we just show hex codes)
        palette_str = " ".join(d.palette_hex[:3])
        rows.append(
            {
                "#": i,
                "Thumb": str(d.raw.thumb_url) if d.raw.thumb_url else None,
                "Advertiser": d.raw.advertiser_name,
                "Hook (3s)": d.hook.summary[:80],
                "Pitch": d.hook.emotional_pitch,
                "Visual": d.visual_style,
                "Palette": palette_str,
                "CTA": d.cta_text or "—",
                "Video": str(d.raw.creative_url),
            }
        )
    st.dataframe(
        rows,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Thumb": st.column_config.ImageColumn("Thumb", width="small"),
            "Video": st.column_config.LinkColumn(
                "Video",
                display_text="▶ Open",
                width="small",
            ),
        },
    )


def render_archetype_card(
    arch: CreativeArchetype,
    *,
    deconstructed_index: dict[str, DeconstructedCreative] | None = None,
) -> None:
    """Render one archetype card.

    If ``deconstructed_index`` is provided (creative_id → DeconstructedCreative),
    we also show a thumbnail strip and per-member video links so the user can
    inspect the source creatives that built this archetype.
    """
    with st.container(border=True):
        cols = st.columns([3, 1, 1, 1, 1])
        cols[0].markdown(f"**{arch.label}**  \n_{len(arch.member_creative_ids)} creatives_")
        cols[1].metric("Velocity", f"{arch.velocity_score:.2f}")
        cols[2].metric("Derivative", f"{arch.derivative_spread:.2f}")
        cols[3].metric("Freshness", f"{arch.freshness_days:.0f}d")
        cols[4].metric("Score", f"{arch.overall_signal_score:.2f}")
        st.caption(arch.rationale)

        # Centroid hook palette
        if arch.palette_hex:
            st.markdown(
                "**Palette:** "
                + "".join(
                    f'<span style="display:inline-block;width:20px;height:20px;'
                    f'background:{c};border-radius:4px;margin-right:4px;'
                    f'vertical-align:middle"></span>'
                    for c in arch.palette_hex
                )
                + " <span style='color:#888;font-size:0.85em'>"
                + " ".join(f"<code>{c}</code>" for c in arch.palette_hex)
                + "</span>",
                unsafe_allow_html=True,
            )

        # Source creatives mini-gallery
        if deconstructed_index:
            members = [
                deconstructed_index[cid]
                for cid in arch.member_creative_ids
                if cid in deconstructed_index
            ]
            if members:
                with st.expander(f"🎬 {len(members)} source creative(s)"):
                    for m in members:
                        mcols = st.columns([1, 4])
                        with mcols[0]:
                            if m.raw.thumb_url:
                                st.image(str(m.raw.thumb_url), use_container_width=True)
                        with mcols[1]:
                            st.markdown(
                                f"**{m.raw.advertiser_name}** · {m.raw.network} · "
                                f"share={m.raw.share or 0:.3f}"
                            )
                            st.caption(m.hook.summary[:140])
                            st.markdown(f"[▶ Open video]({m.raw.creative_url})")


def render_fit_score_row(arch: CreativeArchetype, sc: GameFitScore) -> None:
    with st.container(border=True):
        cols = st.columns([3, 1, 1, 1, 1])
        cols[0].markdown(f"**{arch.label}**")
        cols[1].metric("Visual", sc.visual_match)
        cols[2].metric("Mechanic", sc.mechanic_match)
        cols[3].metric("Audience", sc.audience_match)
        cols[4].metric("Overall", sc.overall)
        st.caption(sc.rationale)


def _is_stub_url(url: str) -> bool:
    return "picsum.photos" in (url or "")


def render_variant_card(variant: GeneratedVariant) -> None:
    all_assets = [variant.hero_frame_path, *variant.storyboard_paths]
    stub_count = sum(_is_stub_url(u) for u in all_assets)

    with st.container(border=True):
        if stub_count == len(all_assets) and len(all_assets) > 0:
            st.info(
                "ℹ️ Scenario credentials missing — placeholder images shown. "
                "Add `SCENARIO_API_KEY` and `SCENARIO_API_SECRET` to `.env` and re-run."
            )
        elif stub_count > 0:
            st.warning(
                f"⚠️ {stub_count}/{len(all_assets)} assets are placeholders "
                "(Scenario job timed out). Re-run later to retry — successful "
                "assets are cached, only the timed-out ones will hit Scenario again."
            )

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
