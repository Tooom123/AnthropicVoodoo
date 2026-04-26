"""HookLens — Streamlit v2 (existing game + new prototype modes).

Run locally:
    uv run streamlit run streamlit_app.py

Two modes share the same 8 downstream steps; only the front of the pipeline differs:

- 🎮 Existing game     : SensorTower /search_entities + /apps → AppMetadata → ...
- 🧪 New prototype     : PM-uploaded mockups + name + description → synthetic AppMetadata → ...

After step 2, both modes feed the exact same Game DNA → Archetypes → Game-fit →
Briefs → Scenario flow.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from app.models import HookLensReport
from app.pipeline import (
    PipelineConfig,
    PrototypeInput,
    run_pipeline,
    run_pipeline_prototype,
)
from app.ui.cards import (
    render_app_metadata,
    render_archetype_card,
    render_brief_card,
    render_deconstructed_table,
    render_fit_score_row,
    render_game_dna,
    render_pitch_story,
    render_raw_creatives_table,
    render_top_advertisers_table,
    render_variant_card,
)

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent
load_dotenv(REPO_ROOT / ".env")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)

st.set_page_config(
    page_title="HookLens — Voodoo Hack 2026",
    page_icon="🎯",
    layout="wide",
)

UPLOADS_DIR = REPO_ROOT / "data" / "uploads"

# ---------------------------------------------------------------------------
# Sidebar — common pipeline knobs + mode-specific inputs
# ---------------------------------------------------------------------------

with st.sidebar:
    st.markdown("### 🎯 HookLens")
    st.caption("Voodoo Hack 2026 · Track 3 · v2 (existing + prototype)")

    mode = st.radio(
        "Pipeline mode",
        options=["existing", "prototype"],
        format_func=lambda m: {
            "existing": "🎮 Existing game",
            "prototype": "🧪 New prototype",
        }[m],
        horizontal=False,
        help=(
            "Existing → look up the game on SensorTower and pull its store metadata.\n\n"
            "Prototype → for unreleased games: upload mockups + write a description, "
            "we synthesize the metadata. Steps 3-10 run identically afterwards."
        ),
    )

    st.divider()

    with st.form("pipeline_form", clear_on_submit=False):
        # ----- Mode-specific inputs -----
        if mode == "existing":
            game_name = st.text_input("Target game", value="Marble Sort")
            proto_name = ""
            proto_description = ""
            proto_audience = ""
            proto_uploads = []
        else:
            proto_name = st.text_input(
                "Prototype name",
                value="",
                placeholder="e.g. Marble Mansion",
            )
            proto_description = st.text_area(
                "Pitch / description",
                height=120,
                placeholder=(
                    "Describe the core loop, hook, and feel. The more concrete, "
                    "the better the Game DNA. Min 30 characters."
                ),
            )
            proto_audience = st.text_input(
                "Target audience (optional)",
                value="",
                placeholder="e.g. casual women 25-45",
            )
            proto_uploads = st.file_uploader(
                "Screenshots / mockups (1-5, 9:16 portrait)",
                type=["png", "jpg", "jpeg", "webp"],
                accept_multiple_files=True,
                help=(
                    "Drop in-game screenshots or design mockups. Gemini Vision "
                    "uses up to 3 of these to extract the Game DNA — palette, "
                    "audience proxy, mechanics, mood."
                ),
            )
            game_name = ""  # not used in this mode

        st.divider()
        st.caption("Common parameters · _hover ℹ️ on any field for details_")

        country = st.selectbox(
            "Country",
            ["US", "GB", "FR", "JP", "DE", "BR"],
            index=0,
            help=(
                "ISO-2 country code for the SensorTower scan. Defines which "
                "geographic ad market we observe — US is biggest for puzzle/casual; "
                "JP/KR have very different hook conventions."
            ),
        )
        network = st.selectbox(
            "Network",
            ["TikTok", "Facebook", "Instagram", "Admob", "Unity"],
            index=0,
            help=(
                "Ad network to scan. SensorTower's `creatives/top` endpoint "
                "requires exactly one network (no 'All Networks'). TikTok = best "
                "signal for emerging hyper/hybrid-casual hooks; Admob = broader "
                "volume; Facebook = older-audience tilt."
            ),
        )
        category_id = st.selectbox(
            "iOS Category",
            options=[7012, 7003, 7004, 7005, 7017, 7015, 7014],
            format_func=lambda x: {
                7003: "Casual",
                7004: "Board",
                7005: "Card",
                7012: "Puzzle",
                7014: "Role Playing",
                7015: "Simulation",
                7017: "Strategy",
            }.get(x, str(x)),
            index=0,
            help=(
                "iOS App Store category. Drives the market scan — we only see "
                "ads from competitors in this segment. In prototype mode this is "
                "also the target category we'll position the new game in."
            ),
        )
        period = st.selectbox(
            "Period",
            ["week", "month", "quarter"],
            index=1,
            help=(
                "Aggregation window for the SensorTower share/SoV metrics. "
                "Shorter (week) = more reactive to breakouts but noisier; "
                "longer (quarter) = more stable but misses fresh hooks."
            ),
        )
        period_date = st.text_input(
            "Period start (YYYY-MM-DD)",
            value="2026-04-01",
            help=(
                "Anchor date for the period window. SensorTower returns the "
                "period starting from this date going backward."
            ),
        )

        st.divider()
        st.caption("⚙️ Pipeline tuning · _safe to leave at defaults_")
        max_creatives = st.slider(
            "Max creatives to scan",
            4,
            20,
            8,
            help=(
                "Number of top ad creatives we'll deconstruct with Gemini Pro. "
                "More = richer archetype clustering but slower (~10s/video) and "
                "more expensive (~$0.01/video on Gemini)."
            ),
        )
        top_k_archetypes = st.slider(
            "Top archetypes to keep",
            3,
            8,
            5,
            help=(
                "How many archetype clusters we score against the Game DNA "
                "(step 7 — Game-fit). More = broader exploration; each extra "
                "archetype adds one Claude Opus call (~$0.05)."
            ),
        )
        top_k_variants = st.slider(
            "Final variants to generate",
            1,
            5,
            3,
            help=(
                "How many creative briefs + Scenario images we produce as the "
                "final deliverable. 3 is the sweet spot for A/B testing — "
                "enough variety to compare hooks without overwhelming the UA team."
            ),
        )
        deconstruct_concurrency = st.slider(
            "Gemini parallelism",
            1,
            8,
            5,
            help=(
                "How many video deconstruction calls to Gemini Pro run "
                "simultaneously. We use asyncio.Semaphore(N): N concurrent "
                "video uploads + analyses. 5 is safe; 8 may hit Gemini's rate "
                "limit; 1 is sequential (slow but trivial to debug)."
            ),
        )

        submitted = st.form_submit_button(
            "🚀 Run pipeline", type="primary", use_container_width=True
        )

    st.divider()
    st.caption("Cost estimate (default settings): **~$1-2** per run.")
    st.caption(
        "Disk cache: every external call cached under `data/cache/`. "
        "Re-running on the same input is instant."
    )


# ---------------------------------------------------------------------------
# Main — pipeline execution + progressive reveal
# ---------------------------------------------------------------------------

st.title("HookLens")
st.caption(
    "Market-driven creative pipeline · "
    "SensorTower → Gemini → Claude Opus → Scenario"
)

if not submitted and "report" not in st.session_state:
    cols = st.columns(2)
    with cols[0]:
        st.info(
            "**🎮 Existing game mode**\n\n"
            "Pick a game published on the App Store. We look it up on "
            "SensorTower, pull its screenshots and category, then scan the "
            "market for high-signal hooks adapted to it.\n\n"
            "Best for *what creative should we ship for our existing game?*"
        )
    with cols[1]:
        st.success(
            "**🧪 New prototype mode**\n\n"
            "Upload 1-5 mockups + a short description. We synthesize the "
            "Game DNA from the mockups and run the full market analysis.\n\n"
            "Best for *should we soft-launch this prototype, and with which "
            "ad creative?* — collapses Voodoo's 2-week soft-launch into 5 min."
        )
    st.markdown(
        "👈 Pick a mode and configure the run in the sidebar, then click "
        "**🚀 Run pipeline**."
    )
    st.stop()

# ---------------------------------------------------------------------------
# Build the run inputs from the form
# ---------------------------------------------------------------------------

if submitted:
    # Common config
    st.session_state.config = PipelineConfig(
        game_name=game_name,
        country=country,
        network=network,
        category_id=category_id,
        period=period,
        period_date=period_date,
        max_creatives=max_creatives,
        top_k_archetypes=top_k_archetypes,
        top_k_variants=top_k_variants,
        deconstruct_concurrency=deconstruct_concurrency,
    )
    st.session_state.mode = mode

    if mode == "prototype":
        # Validate prototype inputs
        if not proto_name.strip():
            st.error("Prototype name is required.")
            st.stop()
        if len(proto_description) < 30:
            st.error(
                "Description must be at least 30 characters — Gemini Vision "
                "needs context to generate a meaningful Game DNA."
            )
            st.stop()
        if not proto_uploads:
            st.error("Upload at least 1 screenshot/mockup.")
            st.stop()

        # Persist uploads to disk so the pipeline can read them
        from app.pipeline import _slug

        proto_dir = UPLOADS_DIR / _slug(proto_name)
        proto_dir.mkdir(parents=True, exist_ok=True)
        screenshot_paths: list[Path] = []
        for i, upload in enumerate(proto_uploads[:5]):
            target = proto_dir / f"upload_{i:02d}{Path(upload.name).suffix}"
            target.write_bytes(upload.getvalue())
            screenshot_paths.append(target)

        st.session_state.prototype = PrototypeInput(
            name=proto_name.strip(),
            description=proto_description.strip(),
            screenshot_paths=screenshot_paths,
            target_category_id=category_id,
            target_audience_proxy=proto_audience.strip() or None,
        )
    else:
        st.session_state.pop("prototype", None)

    # Force a fresh run when the user resubmits
    st.session_state.pop("report", None)


config: PipelineConfig = st.session_state.config
mode: str = st.session_state.get("mode", "existing")

# ---------------------------------------------------------------------------
# Sections (one st.empty per pipeline step) + progress bar
# ---------------------------------------------------------------------------

# In prototype mode, render the PM-uploaded inputs as a recap card right at
# the top, then skip step 1 (target_meta) entirely. In existing-game mode,
# step 1 renders the real SensorTower metadata as before.
if mode == "prototype":
    proto: PrototypeInput = st.session_state.prototype
    with st.container(border=True):
        st.markdown(f"### 🧪 Prototype inputs · {proto.name}")
        cols = st.columns([2, 3])
        with cols[0]:
            st.markdown(f"**Description**\n\n_{proto.description}_")
            if proto.target_audience_proxy:
                st.markdown(f"**Target audience:** {proto.target_audience_proxy}")
            st.caption(
                f"Synthetic app_id: `{st.session_state.config.game_name or 'proto_' + proto.name.lower().replace(' ', '_')}`"
            )
        with cols[1]:
            st.markdown(f"**{len(proto.screenshot_paths)} mockup(s) uploaded**")
            scols = st.columns(min(len(proto.screenshot_paths), 5))
            for sc, path in zip(scols, proto.screenshot_paths[:5], strict=False):
                with sc:
                    st.image(str(path), use_container_width=True)
    st.divider()

sections: dict[str, "st.delta_generator.DeltaGenerator"] = {
    "target_meta": st.empty(),
    "game_dna": st.empty(),
    "top_advertisers": st.empty(),
    "raw_creatives": st.empty(),
    "deconstructed": st.empty(),
    "archetypes": st.empty(),
    "fit_scores": st.empty(),
    "briefs": st.empty(),
    "variants": st.empty(),
    "report": st.empty(),
}

progress_holder = st.empty()
total_steps = 9 if mode == "prototype" else 10


def on_step(
    step_id: str, label: str, idx: int, payload: object, duration_s: float
) -> None:
    """Render the step's output as soon as it completes."""
    progress_holder.progress(
        idx / total_steps,
        text=f"Step {idx}/{total_steps} done · {label} ({duration_s:.1f}s)",
    )
    container = sections[step_id]

    # One-liner explainer per step so the user always knows what just happened.
    explainers = {
        "target_meta": (
            "Resolved the target game on SensorTower (or built synthetic "
            "metadata in prototype mode). Screenshots + description below "
            "feed the next step."
        ),
        "game_dna": (
            "Gemini 2.5 Pro Vision compresses screenshots + description into "
            "a structured Game DNA — the anchor every downstream scoring "
            "step uses to decide if a market hook fits THIS game."
        ),
        "top_advertisers": (
            "SensorTower /ad_intel/top_apps — who is buying ads in this "
            "category, ranked by Share of Voice. Defines our competitive "
            "universe."
        ),
        "raw_creatives": (
            "SensorTower /ad_intel/creatives/top — the actual ad videos "
            "running right now. `phashion_group` is a perceptual hash: "
            "same value across rows = visual derivatives = signal of a "
            "hook being copied."
        ),
        "deconstructed": (
            "Each video uploaded to Gemini 2.5 Pro and deconstructed into "
            "structured features (hook 3s, scene flow, palette, on-screen "
            "text, voiceover, CTA). Async pool, ~10s/video."
        ),
        "archetypes": (
            "Local clustering on (emotional_pitch × visual_style). For each "
            "cluster we compute 3 NON-OBVIOUS signals: velocity (fresher = "
            "rising), derivative_spread (more advertisers = stronger market "
            "validation), freshness (mean age). The composite score is what "
            "ranks them."
        ),
        "fit_scores": (
            "Claude Opus 4.7 scores each top archetype against the Game DNA "
            "on 3 axes (visual / mechanic / audience). Filters market-strong "
            "but game-inappropriate hooks. The thumbnail you see is the "
            "centroid creative of that cluster."
        ),
        "briefs": (
            "Claude Opus 4.7 authors a fully-structured CreativeBrief for "
            "each top-fit archetype: hook, scene flow, visual direction, "
            "copy, CTA, rationale, and the actual Scenario prompts."
        ),
        "variants": (
            "Scenario img2img generation: each prompt is rendered using "
            "your target game's screenshots as visual reference (strength "
            "0.6) so the generated ad keeps the game's identity — palette, "
            "characters, UI — and avoids the deceptive-ad problem."
        ),
        "report": (
            "Final HookLensReport composed and saved to `data/cache/reports/`. "
            "Pitch story generated below."
        ),
    }

    with container.container():
        st.markdown(f"### {idx}. {label}  ·  _{duration_s:.1f}s_")
        if step_id in explainers:
            st.caption(explainers[step_id])

        if step_id == "target_meta":
            render_app_metadata(payload)  # type: ignore[arg-type]

        elif step_id == "game_dna":
            render_game_dna(payload)  # type: ignore[arg-type]

        elif step_id == "top_advertisers":
            render_top_advertisers_table(payload)  # type: ignore[arg-type]

        elif step_id == "raw_creatives":
            render_raw_creatives_table(payload)  # type: ignore[arg-type]

        elif step_id == "deconstructed":
            render_deconstructed_table(payload)  # type: ignore[arg-type]
            st.session_state["__deconstructed_index"] = {
                d.raw.creative_id: d for d in payload  # type: ignore[union-attr]
            }

        elif step_id == "archetypes":
            decon_idx = st.session_state.get("__deconstructed_index")
            for arch in payload:  # type: ignore[union-attr]
                render_archetype_card(arch, deconstructed_index=decon_idx)
            # cache top archetypes for the fit_scores step (so we can pair them)
            st.session_state["__top_archetypes_for_fit"] = payload

        elif step_id == "fit_scores":
            archs = st.session_state.get("__top_archetypes_for_fit") or []
            decon_idx = st.session_state.get("__deconstructed_index")
            for arch, sc in zip(archs, payload, strict=False):  # type: ignore[arg-type]
                render_fit_score_row(arch, sc, deconstructed_index=decon_idx)

        elif step_id == "briefs":
            st.caption(
                "Each brief is fully structured and ready to paste into a "
                "creative ticket. The Scenario prompts (in the expander) are "
                "what step 9 will execute against your game's actual screenshots "
                "to keep the visuals on-brand."
            )
            for brief in payload:  # type: ignore[union-attr]
                render_brief_card(brief)

        elif step_id == "variants":
            for variant in payload:  # type: ignore[union-attr]
                render_variant_card(variant)

        elif step_id == "report":
            st.session_state.report = payload
            report: HookLensReport = payload  # type: ignore[assignment]
            st.success(
                f"✅ Pipeline complete · "
                f"{report.market_context.num_creatives_analyzed} creatives analyzed · "
                f"{len(report.top_archetypes)} archetypes · "
                f"{len(report.final_variants)} variants generated · "
                f"total ${report.total_cost_usd:.4f}"
            )


# ---------------------------------------------------------------------------
# Run the right pipeline branch
# ---------------------------------------------------------------------------

t0 = time.perf_counter()
try:
    if mode == "prototype":
        proto: PrototypeInput = st.session_state.prototype
        report = run_pipeline_prototype(proto, config, on_step=on_step)
    else:
        report = run_pipeline(config, on_step=on_step)
except Exception as e:  # noqa: BLE001
    progress_holder.empty()
    st.error(f"Pipeline failed: {e}")
    st.exception(e)
    st.stop()

elapsed = time.perf_counter() - t0
progress_holder.success(
    f"🎉 Pipeline complete in {elapsed:.1f}s · "
    f"{len(report.final_variants)} variants ready"
)

# ---------------------------------------------------------------------------
# Footer — pitch story + downloads
# ---------------------------------------------------------------------------

st.divider()
st.markdown("## 📋 Pitch story")
render_pitch_story(report, network=config.network)

st.divider()
cols = st.columns(3)
with cols[0]:
    st.download_button(
        "⬇️ Download full report (JSON)",
        data=report.model_dump_json(indent=2),
        file_name=f"hooklens_report_{report.target_game.app_id}.json",
        mime="application/json",
        use_container_width=True,
    )
with cols[1]:
    st.metric("Total runtime", f"{report.pipeline_duration_seconds:.1f}s")
with cols[2]:
    st.metric("Total cost (est.)", f"${report.total_cost_usd:.4f}")
