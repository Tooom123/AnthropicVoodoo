"""Creative brief generation for the first prototype."""

from __future__ import annotations

from app.models import CreativeArchetype, CreativeBrief, GameDNA, GameFitScore


def _cta_for_game(game_dna: GameDNA, archetype: CreativeArchetype) -> str:
    if "sort" in archetype.archetype_id:
        return "Sort Now"
    if "transformation" in archetype.archetype_id:
        return "Merge Now"
    return "Play Now"


def generate_briefs(
    game_dna: GameDNA,
    selected_pairs: list[tuple[CreativeArchetype, GameFitScore, float]],
) -> list[CreativeBrief]:
    """Create structured briefs from ranked archetype candidates."""
    briefs: list[CreativeBrief] = []

    for archetype, fit_score, _priority_score in selected_pairs:
        cta = _cta_for_game(game_dna, archetype)
        title = f"{game_dna.name} x {archetype.label}"
        hook_3s = (
            f"Open on {game_dna.name} with {archetype.centroid_hook.summary.lower()}"
        )
        scene_flow = [
            f"Show the target board state for {game_dna.name} with immediate visual clarity.",
            f"Adapt the winning market hook: {archetype.centroid_hook.visual_action}.",
            f"Reveal the game-specific payoff tied to {', '.join(game_dna.key_mechanics[:2])}.",
            f"Close on a solved or upgraded board with CTA '{cta}'.",
        ]
        text_overlays = [
            archetype.centroid_hook.text_overlay or game_dna.name,
            f"{game_dna.key_mechanics[0].title()} better",
            cta,
        ]
        visual_direction = (
            f"Use {game_dna.visual_style}, keep the palette centered on "
            f"{game_dna.palette.primary_hex}, {game_dna.palette.secondary_hex}, and "
            f"{game_dna.palette.accent_hex}, and stay aligned with a "
            f"{game_dna.ui_mood} mood."
        )
        rationale = (
            f"This direction combines a market-proven hook with a {fit_score.overall}/100 "
            f"game fit. Keep the product readable and let the payoff come from "
            f"{game_dna.core_loop.lower()}"
        )
        scenario_prompts = [
            (
                f"9:16 mobile ad hero frame for {game_dna.name}, {game_dna.visual_style}, "
                f"palette {game_dna.palette.primary_hex} {game_dna.palette.secondary_hex} "
                f"{game_dna.palette.accent_hex}, show {archetype.centroid_hook.summary.lower()}, "
                f"overlay text '{text_overlays[0]}', polished mobile puzzle marketing still"
            ),
            (
                f"9:16 storyboard frame for {game_dna.name}, show the player action "
                f"around {game_dna.key_mechanics[0]}, overlay text '{text_overlays[1]}', "
                f"same palette and visual style"
            ),
            (
                f"9:16 closing storyboard frame for {game_dna.name}, solved board payoff, "
                f"overlay text '{cta}', same palette and visual style"
            ),
        ]

        briefs.append(
            CreativeBrief(
                archetype_id=archetype.archetype_id,
                target_game_id=game_dna.app_id,
                title=title,
                hook_3s=hook_3s,
                scene_flow=scene_flow,
                visual_direction=visual_direction,
                text_overlays=text_overlays,
                cta=cta,
                rationale=rationale,
                scenario_prompts=scenario_prompts,
            )
        )

    return briefs

