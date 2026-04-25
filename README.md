# HookLens — Voodoo Hack 2026, Track 3

**Mantra:** A Voodoo PM types a game name on Monday morning and ships 3 testable ad concepts before lunch.

HookLens is a market-intelligence-driven creative pipeline. Input a target mobile game, get back 3 ad creative variants with structured briefs, grounded in fresh market data and tailored to the game's visual identity.

## Pipeline (high-level)

```
Game name
   ↓
1. Game DNA   (SensorTower metadata + Gemini Vision on screenshots)
2. Market scan (top advertisers in same iOS category, last 30 days)
3. Pull ~80 video creatives (SensorTower /ad_intel/creatives/top)
4. Deconstruct each video (Gemini 2.5 Pro → structured features)
5. Cluster into archetypes (phashion_group + share weighting)
6. Score signals: velocity, derivative_spread, freshness
7. Game-fit map (Opus 4.7 reasoning)
8. Generate 3 variants (Scenario MCP + Opus brief)
   ↓
Streamlit dashboard + downloadable briefs
```

## Project layout

```
app/
├── models.py              # Pydantic data contract (LOCKED after Sat 17:00)
├── sources/               # Partner 1 — SensorTower, video downloader
├── analysis/              # User — Game DNA, Gemini deconstruction, signals
├── creative/              # Partner 2 — Briefs, Scenario MCP
├── ui/                    # Streamlit components
└── cache/                 # Sample data for UI dev

docs/
├── hooklens-spec.md       # Product spec (read first)
├── sub-agent-streamlit.md # Prompt for the Streamlit sub-agent
└── sensortower-api.md     # SensorTower API cheat sheet

scripts/
└── precache.py            # Pre-bake 3 demo games for Sunday demo

notebooks/                 # Smoke tests, exploration
data/cache/                # Runtime cache (gitignored)
```

## Workstream ownership

| # | Module | Owner | Path |
|---|---|---|---|
| 1-3 | SensorTower, discovery, downloader | **Partner 1** | `app/sources/` |
| 4-7 | Game DNA, deconstruct, archetypes, fit | **Edouard** | `app/analysis/` |
| 8-9 | Briefs + Scenario MCP | **Partner 2** | `app/creative/` |
| 10 | Streamlit UI | sub-agent + Edouard | `streamlit_app.py`, `app/ui/` |

The integration contract is `app/models.py`. **Do not modify after Saturday 17:00 checkpoint without 3-way sign-off.**

## Setup

```bash
uv venv
source .venv/bin/activate
uv pip install -e .
cp .env.example .env  # add your keys
streamlit run streamlit_app.py
```

## Required env vars

- `SENSORTOWER_API_KEY`
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `SCENARIO_API_KEY` (Partner 2)

## Timeline

See [docs/hooklens-spec.md](docs/hooklens-spec.md) for the full 25h plan and checkpoints.
