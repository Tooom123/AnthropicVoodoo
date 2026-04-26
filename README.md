# VoodRadar

> **AI ad-intelligence platform for mobile-game publishers.**
> Type a game name, get back deconstructed competitor creatives, market
> archetypes, ready-to-test briefs, and rendered video ads — grounded
> in real SensorTower data.

Built for **Voodoo Hack 2026 — Track 3 (Market Intelligence)**.

---

## What it does

VoodRadar turns a single game name into a full competitive creative
dossier in 3–5 minutes:

1. **Game DNA** — pulled from SensorTower metadata + Gemini Vision on
   the App Store screenshots (genre, palette, mechanics, audience).
2. **Market scan** — top advertisers in the same iOS category, last
   30 days, across networks.
3. **Creative pull** — ~80 video ads via SensorTower
   `/ad_intel/creatives/top`, deduped by `phashion_group`.
4. **Deconstruction** — Gemini Pro Vision extracts hook, scene flow,
   text overlays, CTA, palette, audience proxy. Cached **per creative**
   in `data/cache/deconstruct/` (knowledge base).
5. **Archetype clustering** — k-means on the deconstructed features +
   SoV velocity / derivative-spread / freshness signals.
6. **Game-fit scoring** — Claude Opus 4.7 scores each archetype against
   the target Game DNA on visual / mechanic / audience axes.
7. **Brief authoring** — Opus writes per-archetype creative briefs
   tailored to the game's palette and mood.
8. **Visual generation** — Scenario (gpt-image-2) renders a hero frame
   + 2 storyboards per brief.
9. **Video assembly** — Kling i2v generates a 5-second clip per frame,
   ffmpeg concatenates the 3 clips + the game's pre-rendered endcard
   into a 18-second branded ad. Optional music bed, OpenAI TTS
   voiceover, and timed game-feel SFX get mixed in.

The result is a finished mp4 ready to upload to Meta Ads / TikTok.

---

## Architecture

```
                  ┌─────────────────────────────────────────┐
                  │  Frontend (React + TanStack Router)     │
                  │  /  /voodoo  /ads  /insights  /weekly   │
                  │  /competitive  /performance  /geo       │
                  └─────────────────┬───────────────────────┘
                                    │ HTTP + SSE
                  ┌─────────────────▼───────────────────────┐
                  │  FastAPI bridge  (api/main.py)          │
                  │  /api/report  /api/variants/render-video│
                  │  /api/weekly-report  /api/creatives/{id}│
                  │  /api/report/run/stream  (SSE)          │
                  └────┬───────┬──────┬──────┬──────────────┘
                       │       │      │      │
                       ▼       ▼      ▼      ▼
              ┌───────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
              │SensorTower│ │Gemini│ │Opus  │ │Scenario  │
              │ ad-intel  │ │Pro V.│ │ 4.7  │ │img + i2v │
              └───────────┘ └──────┘ └──────┘ └──────────┘
                       │       │      │      │
                       └───────┴──────┴──────┘
                                │
                       ┌────────▼─────────┐
                       │  data/cache/     │
                       │  reports/  game_dna/  briefs/      │
                       │  deconstruct/  endcards/  videos/  │
                       │  audio/  scenario/  voodoo/        │
                       └──────────────────┘
```

The **knowledge base** (`data/cache/deconstruct/`) is the moat: every
Gemini call is keyed by `creative_id` and cached forever. The first
analysis pays Gemini, every subsequent one (cross-game, cross-week,
cross-machine) hits the cache in under 10 ms. A weekly cron of
`scripts/scan_top_competitors.py` keeps it fresh.

---

## Repo layout

```
api/main.py                      # FastAPI: ~10 endpoints, SSE pipeline runner
app/
├── models.py                    # Pydantic data contract (the lingua franca)
├── pipeline.py                  # 10-step pipeline orchestrator
├── analysis/
│   ├── game_dna.py              # SensorTower meta + Gemini Vision on screenshots
│   ├── deconstruct.py           # Gemini Pro Vision per-creative dossier
│   ├── archetypes.py            # k-means clusters + signal scoring
│   └── game_fit.py              # Opus per-archetype game-fit scoring
├── creative/
│   ├── brief.py                 # Opus brief authoring + Voodoo benchmark injection
│   ├── scenario.py              # Scenario REST client (img + i2v + audio)
│   └── video_brief.py           # Tom's Veo3 brainrot pipeline (alt path)
└── sources/
    ├── sensortower.py           # SensorTower /ad_intel + /search wrapper
    └── voodoo.py                # Voodoo catalog harvester (50 games)

front/                           # React app (TanStack Router + Tailwind)
├── src/components/dashboard/    # Page-level views
├── src/components/insights/     # Insights / variant generation widgets
├── src/lib/                     # API hooks + game / pipeline-runs context
└── src/routes/                  # File-based routing

scripts/
├── precache.py                  # Pre-bake a full HookLensReport for one game
├── precache_voodoo_ads.py       # Snapshot the Voodoo portfolio
├── scan_top_competitors.py      # Backfill the deconstruction knowledge base
├── generate_endcards.py         # Render brand endcard images per game
├── animate_endcards.py          # Animate the endcards via Kling i2v
└── generate_demo_video.py       # CLI multi-clip ad assembly (used pre-React)

data/cache/                      # All cached state (selectively gitignored)
├── reports/                     # 16 cached HookLensReports (~440 KB)
├── deconstruct/                 # 499 Gemini deconstructions (~2 MB) ⭐
├── endcards/                    # 16 game endcards (PNG + 3-second MP4)
├── voodoo/                      # 50-game catalog + portfolio snapshot
├── sensortower/                 # Raw SensorTower API responses
├── audio/library/               # User-supplied stock music (per emotional pitch)
├── audio/sfx/                   # User-supplied SFX (whoosh, swoosh, drop, chime)
└── audio/tts/                   # OpenAI TTS cache
```

---

## Running locally

### Prerequisites

- Python 3.12 (pinned in `.python-version`)
- [`uv`](https://github.com/astral-sh/uv) for package management
- Node 20+ for the frontend
- `ffmpeg` + `ffprobe` on `$PATH` (used for video assembly + audio overlay)
- API keys in `.env`:
  - `SENSORTOWER_AUTH_TOKEN`
  - `GEMINI_API_KEY` (for Gemini Pro Vision)
  - `ANTHROPIC_API_KEY` (for Claude Opus 4.7)
  - `SCENARIO_API_KEY` + `SCENARIO_API_SECRET` (for image / video generation)
  - `OPENAI_API_KEY` (optional — for TTS voiceovers)

### One-liner setup

```bash
uv pip install -e ".[dev]"      # backend
cd front && npm install --legacy-peer-deps && cd ..

# Terminal 1 — backend
uv run uvicorn api.main:app --reload --port 8000

# Terminal 2 — frontend
cd front && npm run dev          # → http://localhost:8080
```

The cached state ships with the repo (~30 MB), so a fresh clone has 16
analyzed games + 499 deconstructed ads + 14 brand endcards available
**without paying any API**.

### Re-running the full pipeline on a new game

```bash
uv run python -m scripts.precache "Subway Surfers"
```

This burns ~$0.05–1 in API calls and takes 3–5 minutes. The result
lands in `data/cache/reports/<app_id>_e2e.json` and shows up in the
React UI immediately.

### Refreshing the knowledge base

```bash
uv run python -m scripts.scan_top_competitors --concurrency 5
```

Walks every cached SensorTower creative, deconstructs the ones not
yet in the knowledge base, writes one JSON file per ad to
`data/cache/deconstruct/`. Idempotent — second run is a no-op.

---

## Demo paths

- **Hero report** → http://localhost:8080/insights → "Crowd City"
  (16 cached reports available; Crowd City has the most polished
  variants + a hand-rendered endcard).
- **Generate Ad** → on any cached report, click **Generate Ad** in the
  "Generated ad video" section. With the Scenario clips already
  cached the assembly takes ~30 s instead of 5 min.
- **Knowledge base** → http://localhost:8080/weekly → 499 deconstructed
  ads, distribution by emotional pitch, click any tile to open its
  Gemini dossier on `/ad/<id>`.

---

## Tech stack

| Layer | Tool |
|---|---|
| Backend | Python 3.12 · FastAPI · Pydantic 2 · httpx async · asyncio |
| Frontend | React · Vite · TanStack Router · TanStack Query · Tailwind CSS · shadcn/ui |
| Data | SensorTower (ad-intel + search) · App Store screenshots (CDN) |
| AI | Gemini 2.5/3.x Pro Vision · Claude Opus 4.7 · OpenAI TTS · Scenario (gpt-image-2 + Kling i2v + Veo 3) |
| Video | ffmpeg (concat demuxer + filter_complex amix) |
| Audio | OpenAI TTS · royalty-free stock (Pixabay / Mixkit) |
| Caching | flat JSON files keyed by creative_id / app_id / archetype / hash |

---

## License & credits

Built for the Voodoo Hack 2026 hackathon. SensorTower data is used
under our trial credentials — production deployment would need a
paid SensorTower contract. Audio assets in `data/cache/audio/`
(when provided) come from royalty-free sources (Pixabay CC0, Mixkit
no-attribution).
