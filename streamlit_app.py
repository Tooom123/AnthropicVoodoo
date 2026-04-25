"""HookLens — Streamlit v1 (matches notebook 02 end-to-end).

Run locally:
    uv run streamlit run streamlit_app.py

This v1 mirrors the notebook 1:1: same parameters, same 10 steps, same
caching. v2 will let the PM tune parameters per step. v3 will add live
mode with cached fallback for the demo.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from app.models import HookLensReport
from app.pipeline import PipelineConfig, run_pipeline
from app.ui.cards import (
    render_app_metadata,
    render_archetype_card,
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

# ---------------------------------------------------------------------------
# Sidebar — pipeline parameters
# ---------------------------------------------------------------------------

with st.sidebar:
    st.markdown("### 🎯 HookLens")
    st.caption("Voodoo Hack 2026 · Track 3 · v1 baseline")

    with st.form("pipeline_form"):
        game_name = st.text_input("Target game", value="Marble Sort")
        country = st.selectbox("Country", ["US", "GB", "FR", "JP", "DE", "BR"], index=0)
        network = st.selectbox(
            "Network",
            ["TikTok", "Facebook", "Instagram", "Admob", "Unity"],
            index=0,
            help="creatives/top requires a single network — All Networks is rejected.",
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
        )
        period = st.selectbox("Period", ["week", "month", "quarter"], index=1)
        period_date = st.text_input("Period start (YYYY-MM-DD)", value="2026-04-01")

        st.divider()
        st.caption("⚙️ Pipeline tuning")
        max_creatives = st.slider("Max creatives to scan", 4, 20, 8)
        top_k_archetypes = st.slider("Top archetypes to keep", 3, 8, 5)
        top_k_variants = st.slider("Final variants to generate", 1, 5, 3)
        deconstruct_concurrency = st.slider("Gemini parallelism", 1, 8, 5)

        submitted = st.form_submit_button("🚀 Run pipeline", type="primary", use_container_width=True)

    st.divider()
    st.caption("Cost estimate (default settings): **~$1-2** per run.")
    st.caption(
        "Disk cache: every external call cached under `data/cache/`. "
        "Re-running on the same game is instant."
    )

# ---------------------------------------------------------------------------
# Main — pipeline execution + progressive reveal
# ---------------------------------------------------------------------------

st.title("HookLens")
st.caption("Market-driven creative pipeline · SensorTower → Gemini → Claude Opus → Scenario")

if not submitted and "report" not in st.session_state:
    st.info(
        "👈 Configure the target game in the sidebar and click **Run pipeline** "
        "to launch the end-to-end flow.\n\n"
        "Each step's output appears below as soon as it completes."
    )
    st.stop()

# Build config from form
if submitted:
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
    # Force a fresh run when the user resubmits
    st.session_state.pop("report", None)

config: PipelineConfig = st.session_state.config

# Sections that the on_step callback will populate
sections = {
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
total_steps = 10


def on_step(step_id: str, label: str, idx: int, payload: object, duration_s: float) -> None:
    """Render the step's output as soon as it completes."""
    progress_holder.progress(
        idx / total_steps, text=f"Step {idx}/{total_steps} done · {label} ({duration_s:.1f}s)"
    )
    container = sections[step_id]

    with container.container():
        st.markdown(f"### {idx}. {label}  ·  _{duration_s:.1f}s_")

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

        elif step_id == "archetypes":
            for arch in payload:  # type: ignore[union-attr]
                render_archetype_card(arch)

        elif step_id == "fit_scores":
            top_archs = sections.get("__top_archs_cache")
            # We need the matching archetype list; pull from session state.
            archs = st.session_state.get("__top_archetypes_for_fit") or []
            for arch, sc in zip(archs, payload, strict=False):  # type: ignore[arg-type]
                render_fit_score_row(arch, sc)

        elif step_id == "briefs":
            for brief in payload:  # type: ignore[union-attr]
                with st.container(border=True):
                    st.markdown(f"**{brief.title}**")
                    st.caption(f"For archetype `{brief.archetype_id}`")
                    st.write(brief.hook_3s)

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

    # Cache top_archetypes for the fit_scores rendering step.
    if step_id == "archetypes":
        st.session_state["__top_archetypes_for_fit"] = payload


# Run pipeline (blocks the script — Streamlit re-renders progressively as
# each on_step callback writes to its container)
t0 = time.perf_counter()
try:
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
