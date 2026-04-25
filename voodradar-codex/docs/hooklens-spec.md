# HookLens Spec

## Product

HookLens is a single-input creative intelligence pipeline for Voodoo Hack Track
3. A user types a mobile game name and gets back:

- a structured game DNA
- ranked creative archetypes from the market
- 3 tailored creative briefs
- 3 ready-to-review visual variants

## Golden Path

1. User enters a game name
2. The app resolves the target game metadata
3. The pipeline derives a structured `GameDNA`
4. The system loads comparable market creatives
5. The creatives are deconstructed into hooks, CTAs, and scene flows
6. Archetypes are clustered and ranked with non-obvious signals
7. Archetypes are scored against the target game
8. The best archetypes become creative briefs
9. Visual variants are generated
10. Streamlit renders the full report

## First Shippable Scope

The first end-to-end version favors reliability over raw sophistication:

- local fixture data instead of live SensorTower
- heuristic analysis instead of live Gemini and Claude calls
- placeholder image generation instead of Scenario MCP
- disk-cached reports for `?cached=1`

This gives the team a complete product loop to demo, then each workstream can
swap the stub layer with real APIs without changing the report contract.

## Signal Layer

Each archetype is ranked with:

- `velocity_score`
- `derivative_spread`
- `freshness_days`
- `overall_signal_score`

## Demo Strategy

- Pre-cache 3 games with `scripts/precache.py`
- Demo one cached report instantly
- Narrate how live integrations replace each stub layer

