"""Heuristic creative deconstruction for the first end-to-end prototype."""

from __future__ import annotations

from app.models import DeconstructedCreative, HookFrame, RawCreative


PATTERN_LOOKUP = {
    "asmr-sort": {
        "hook": HookFrame(
            summary="A chaotic board gets cleaned in one smooth move.",
            visual_action="Pieces snap into perfect order across the whole board.",
            text_overlay="Can you sort this?",
            voiceover_transcript="That is so satisfying.",
            emotional_pitch="asmr",
        ),
        "scene_flow": [
            "Open on a messy board with obvious visual friction.",
            "Show one high-clarity move that restores order instantly.",
            "Chain two more cleanups to reinforce the satisfying loop.",
            "Close on a solved state and CTA.",
        ],
        "palette_hex": ["#2EC4B6", "#FFBF69", "#F8F9FA"],
        "visual_style": "in-game",
        "audience_proxy": "casual puzzle players who respond to satisfying cleanup visuals",
    },
    "fail-rescue": {
        "hook": HookFrame(
            summary="A wrong move creates immediate failure pressure.",
            visual_action="The player triggers a near-loss, then the board freezes at the worst time.",
            text_overlay="Only 1 move left",
            voiceover_transcript="Wait, can you fix it?",
            emotional_pitch="fail",
        ),
        "scene_flow": [
            "Open on a simple board and bait the viewer into the wrong move.",
            "Escalate pressure with blocked space and visible failure risk.",
            "Reveal the smart rescue path as a contrast beat.",
            "End with a challenge CTA.",
        ],
        "palette_hex": ["#4D96FF", "#FFD93D", "#FF6B6B"],
        "visual_style": "mixed",
        "audience_proxy": "mass-market puzzle players who like challenge and correction loops",
    },
    "transformation-upgrade": {
        "hook": HookFrame(
            summary="A weak board upgrades into a premium-looking payoff state.",
            visual_action="Small pieces merge into a larger, richer final board.",
            text_overlay="Watch it upgrade",
            voiceover_transcript="Just one merge changes everything.",
            emotional_pitch="transformation",
        ),
        "scene_flow": [
            "Open on a flat low-value board state.",
            "Trigger one merge that visibly upgrades the board.",
            "Stack two larger transformations back to back.",
            "Close on the strongest final reveal and CTA.",
        ],
        "palette_hex": ["#7B61FF", "#FF8FAB", "#F9C74F"],
        "visual_style": "3D-render",
        "audience_proxy": "cozy casual players who love visible progress and upgrades",
    },
}


def _fallback_pattern() -> dict[str, object]:
    return {
        "hook": HookFrame(
            summary="A readable puzzle hook introduces a fast board payoff.",
            visual_action="The board state becomes cleaner and easier to understand.",
            text_overlay="Can you beat this?",
            voiceover_transcript=None,
            emotional_pitch="curiosity",
        ),
        "scene_flow": [
            "Open on a readable puzzle challenge.",
            "Show the satisfying or smart move.",
            "Escalate with one stronger payoff beat.",
            "End on a CTA.",
        ],
        "palette_hex": ["#2D6AEB", "#8ECAE6", "#FFB703"],
        "visual_style": "in-game",
        "audience_proxy": "broad mobile puzzle players",
    }


def deconstruct_creatives(creatives: list[RawCreative]) -> list[DeconstructedCreative]:
    """Convert raw creatives into structured analysis records."""
    results: list[DeconstructedCreative] = []

    for creative in creatives:
        pattern = PATTERN_LOOKUP.get(creative.phashion_group or "", _fallback_pattern())
        on_screen_text = []
        if creative.message:
            on_screen_text.append(creative.message)
        hook = pattern["hook"]
        if hook.text_overlay and hook.text_overlay not in on_screen_text:
            on_screen_text.insert(0, hook.text_overlay)
        if creative.button_text:
            on_screen_text.append(creative.button_text)

        results.append(
            DeconstructedCreative(
                raw=creative,
                hook=hook,
                scene_flow=list(pattern["scene_flow"]),
                on_screen_text=on_screen_text,
                cta_text=creative.button_text,
                cta_timing_seconds=11.0 if creative.video_duration else None,
                palette_hex=list(pattern["palette_hex"]),
                visual_style=str(pattern["visual_style"]),
                audience_proxy=str(pattern["audience_proxy"]),
                deconstruction_model="heuristic-fixture-v1",
                deconstruction_cost_usd=0.0,
            )
        )

    return results

