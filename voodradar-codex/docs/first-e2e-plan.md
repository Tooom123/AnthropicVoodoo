# First E2E Plan

## Objective

Ship a working prototype in this folder that proves the entire HookLens flow,
without waiting for every external integration.

## Build Order

1. Lock the report contract in `app/models.py`
2. Create a fixture-driven source layer in `app/sources/`
3. Implement analysis modules in `app/analysis/`
4. Implement brief and asset generation in `app/creative/`
5. Add an orchestrator in `app/pipeline.py`
6. Add a Streamlit UI in `streamlit_app.py`
7. Add a precache script for Sunday demo mode

## Team-Friendly Swap Points

- `app/sources/stub.py`
  Future replacement: SensorTower client and discovery logic
- `app/analysis/game_dna.py`
  Future replacement: Gemini Vision on screenshots
- `app/analysis/deconstruct.py`
  Future replacement: Gemini creative deconstruction
- `app/analysis/game_fit.py`
  Future replacement: Claude fit scoring
- `app/creative/scenario.py`
  Future replacement: Scenario MCP

## Done Definition

A game name should produce:

- one saved report JSON
- at least 3 ranked archetypes
- at least 3 generated variants
- a Streamlit page that renders the report

