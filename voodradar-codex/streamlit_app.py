"""Streamlit entrypoint for the HookLens prototype."""

from __future__ import annotations

import logging

import streamlit as st

from app.config import load_settings
from app.logging_utils import configure_logging
from app.pipeline import run_pipeline
from app.ui import render_report


def main() -> None:
    """Render the main Streamlit app."""
    configure_logging(logging.INFO)
    settings = load_settings()

    st.set_page_config(page_title="HookLens", page_icon="🎯", layout="wide")

    query_params = st.query_params
    cached_default = str(query_params.get("cached", "0")) == "1"
    default_game = str(query_params.get("game", settings.demo_games[0]))

    st.sidebar.header("Run")
    selected_game = st.sidebar.selectbox(
        "Demo game",
        options=list(settings.demo_games),
        index=list(settings.demo_games).index(default_game)
        if default_game in settings.demo_games
        else 0,
    )
    custom_game = st.sidebar.text_input("Or type a custom game", value=default_game)
    cached_mode = st.sidebar.toggle("Use cached report", value=cached_default)
    run_now = st.sidebar.button("Run HookLens", use_container_width=True)

    chosen_game = custom_game.strip() or selected_game

    st.markdown(
        """
        This first version is fixture-backed on purpose. The report contract, UI,
        and cache flow are already in place, so you can swap in SensorTower,
        Gemini, and Scenario without redesigning the app.
        """
    )

    if run_now or cached_mode:
        report = run_pipeline(chosen_game, cached=cached_mode)
        render_report(report)
    else:
        st.info("Pick a game in the sidebar, then run the pipeline.")


if __name__ == "__main__":
    main()

