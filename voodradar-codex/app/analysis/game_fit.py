"""Heuristic scoring of market archetypes against the target game."""

from __future__ import annotations

from app.models import CreativeArchetype, GameDNA, GameFitScore


def _overlap_score(left: list[str], right: list[str]) -> int:
    left_tokens = {item.lower() for item in left}
    right_tokens = {item.lower() for item in right}
    overlap = len(left_tokens & right_tokens)
    return min(100, 40 + overlap * 20)


def _visual_score(game: GameDNA, archetype: CreativeArchetype) -> int:
    score = 60
    if game.ui_mood == "calm/satisfying" and "asmr" in archetype.archetype_id:
        score += 25
    if game.ui_mood == "cozy/relaxing" and "transformation" in archetype.archetype_id:
        score += 18
    if game.ui_mood == "energetic/competitive" and "fail" in archetype.archetype_id:
        score += 15
    if game.visual_style.startswith("cartoon") and archetype.centroid_hook.emotional_pitch == "asmr":
        score += 6
    return min(score, 100)


def _audience_score(game: GameDNA, archetype: CreativeArchetype) -> int:
    score = 70
    if game.genre == "puzzle":
        score += 10
    if "casual" in game.audience_proxy.lower():
        score += 8
    if "challenge" in archetype.centroid_hook.summary.lower():
        score -= 4
    return max(0, min(score, 100))


def score_game_fit(
    game_dna: GameDNA,
    archetypes: list[CreativeArchetype],
) -> list[GameFitScore]:
    """Score each archetype against the target game's identity."""
    scores: list[GameFitScore] = []

    for archetype in archetypes:
        mechanic_match = _overlap_score(
            game_dna.key_mechanics,
            archetype.common_mechanics,
        )
        visual_match = _visual_score(game_dna, archetype)
        audience_match = _audience_score(game_dna, archetype)
        overall = round(
            0.4 * mechanic_match + 0.35 * visual_match + 0.25 * audience_match
        )

        if mechanic_match >= 80:
            strength = "The mechanic fit is strong."
        elif mechanic_match >= 60:
            strength = "The hook can be adapted without breaking the core loop."
        else:
            strength = "The hook needs adaptation to feel native to the product."

        risk = (
            "The main risk is leaning too far into generic category patterns."
            if overall < 80
            else "The main risk is over-polishing the ad and losing product clarity."
        )

        scores.append(
            GameFitScore(
                archetype_id=archetype.archetype_id,
                visual_match=visual_match,
                mechanic_match=mechanic_match,
                audience_match=audience_match,
                overall=overall,
                rationale=(
                    f"{strength} {risk} For {game_dna.name}, the best angle is to keep "
                    "the market hook but anchor it in the game's own payoff cadence."
                ),
            )
        )

    scores.sort(key=lambda item: item.overall, reverse=True)
    return scores

