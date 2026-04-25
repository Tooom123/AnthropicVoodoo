"""Author structured creative briefs for the top archetypes via Claude Opus.

Owner: Partner 2 (creative). v1 baseline by Edouard so the Streamlit pipeline
can ship before the 17:00 checkpoint. The output ``CreativeBrief`` is exactly
what ``app.creative.scenario`` consumes downstream.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import anthropic

from app._cache import disk_cached
from app._paths import CACHE_DIR
from app.models import CreativeArchetype, CreativeBrief, GameDNA, GameFitScore

log = logging.getLogger(__name__)

DEFAULT_CACHE_DIR = CACHE_DIR / "briefs"
OPUS_MODEL = "claude-opus-4-7"

BRIEF_TOOL = {
    "name": "report_creative_brief",
    "description": "Author a structured creative brief tailored to a target game.",
    "input_schema": CreativeBrief.model_json_schema(),
}


def _client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY missing. Add it to .env.")
    return anthropic.Anthropic(api_key=key)


def _build_prompt(arch: CreativeArchetype, sc: GameFitScore, dna: GameDNA) -> str:
    return f"""You're a creative director shipping a playable-ad concept for a mobile game.

TARGET GAME:
{dna.model_dump_json(indent=2)}

WINNING ARCHETYPE (from market scan):
- Label: {arch.label}
- Centroid hook: {arch.centroid_hook.model_dump_json()}
- Why it wins: {arch.rationale}

GAME-FIT REASONING:
- Visual: {sc.visual_match}/100, Mechanic: {sc.mechanic_match}/100, Audience: {sc.audience_match}/100
- Notes: {sc.rationale}

Author a CreativeBrief that adapts the archetype to {dna.name}. Specifically:
- ``hook_3s`` must be tight, sensory, on-brand for the game's palette and mood
- ``scene_flow`` 3-5 beats describing the 15-second arc
- ``visual_direction`` ties palette + style to the Game DNA
- ``text_overlays`` 3-6 short overlays in chronological order
- ``cta`` is a punchy 1-3 word CTA
- ``rationale`` 2-3 sentences, action-oriented for the UA team
- ``scenario_prompts`` are 2-3 ready-to-paste Scenario txt2img prompts for: hero frame (the strongest single still), and 1-2 storyboard frames. Each prompt MUST mention: aspect 9:16, the game palette ({dna.palette.primary_hex}, {dna.palette.secondary_hex}, {dna.palette.accent_hex}), the visual style "{dna.visual_style}", and one signature on-screen text.

Then call the tool.
"""


def author_brief(
    arch: CreativeArchetype, sc: GameFitScore, dna: GameDNA
) -> CreativeBrief:
    """Generate one ``CreativeBrief`` (cached on disk by archetype × game pair)."""
    prompt = _build_prompt(arch, sc, dna)

    def _call() -> CreativeBrief:
        resp = _client().messages.create(
            model=OPUS_MODEL,
            max_tokens=2500,
            tools=[BRIEF_TOOL],
            tool_choice={"type": "tool", "name": "report_creative_brief"},
            messages=[{"role": "user", "content": prompt}],
        )
        tool_block = next(b for b in resp.content if getattr(b, "type", "") == "tool_use")
        return CreativeBrief.model_validate(
            {
                **tool_block.input,
                "archetype_id": arch.archetype_id,
                "target_game_id": dna.app_id,
            }
        )

    return disk_cached(
        DEFAULT_CACHE_DIR,
        f"brief_{arch.archetype_id}_{dna.app_id}",
        {"prompt": prompt},
        _call,
        parser=CreativeBrief.model_validate_json,
    )


def author_briefs(
    chosen: list[tuple[CreativeArchetype, GameFitScore]], dna: GameDNA
) -> list[CreativeBrief]:
    """Author one brief per (archetype, fit_score) pair."""
    return [author_brief(arch, sc, dna) for (arch, sc) in chosen]
