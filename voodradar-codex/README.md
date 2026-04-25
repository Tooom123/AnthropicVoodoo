# HookLens

HookLens is a market-intelligence prototype for Voodoo Hack Track 3.

The first version in this folder is intentionally scoped for speed:

- one input: a target mobile game name
- one end-to-end pipeline
- cached JSON output in `data/cache/reports/`
- Streamlit UI with `?cached=1`
- placeholder creative assets generated locally so the demo works before all
  external APIs are wired

## Current Pipeline

1. Resolve a target game from a local fixture catalog
2. Build `AppMetadata`
3. Extract a heuristic `GameDNA`
4. Load comparable market creatives from fixture data
5. Deconstruct creatives into structured hooks
6. Cluster them into archetypes and compute signal scores
7. Score game fit
8. Generate 3 creative briefs
9. Render placeholder hero and storyboard frames
10. Save a `HookLensReport` JSON that Streamlit consumes

## Setup

```bash
uv python install 3.12
uv sync --all-extras
cp .env.example .env
uv run streamlit run streamlit_app.py
```

## Demo Mode

- Live-like cached mode:

```bash
uv run streamlit run streamlit_app.py
```

Then open the app with `?cached=1`.

- Pre-cache the 3 demo games:

```bash
uv run python scripts/precache.py
```

## Next Integrations

- `app/sources/`: replace fixture catalog with SensorTower
- `app/analysis/`: swap heuristic Game DNA and deconstruction with Gemini
- `app/creative/`: replace placeholder asset generator with Scenario MCP

