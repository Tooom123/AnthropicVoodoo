<div align="center">

# 🏆 VoodRadar

### **AI ad-intelligence platform for mobile-game publishers**

[![Hackathon Winner](https://img.shields.io/badge/🏆_Voodoo_Hack_2026-1st_place_·_Track_3_Market_Intelligence-FFD700?style=for-the-badge)](#)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Anthropic Opus 4.7](https://img.shields.io/badge/Claude_Opus_4.7-D4A574?style=flat&logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![Gemini Pro Vision](https://img.shields.io/badge/Gemini_2.5_Pro-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)

**Type a mobile-game name → 5 minutes later, get 3 ready-to-test ad videos**
**grounded in fresh SensorTower market signals.**

<img src="docs/screenshots/voodradar-hero-ad.gif" alt="VoodRadar — sample generated ad for Archery Clash" width="280">

*↑ One of the ads VoodRadar generated end-to-end during the demo: Archery Clash, "WhatsApp ping → archery hook" angle. Bespoke Opus-authored narration, OpenAI TTS voice-over, music bed auto-ducked to 25%, timed game SFX, branded endcard transition. **Zero human edit.***

</div>

---

## TL;DR — what the jury saw

> **As a Voodoo PM managing 50 live games, I want VoodRadar to tell me every Monday morning which titles need a creative refresh, deconstruct what's currently winning in the category, and ship me three on-brand video variants ready to A/B test — in less time than my coffee gets cold.**

VoodRadar turns a single game name into a full competitive creative dossier in **3 to 5 minutes**:

1. **Pulls** the live SensorTower top-creatives feed (4 networks × 7 countries) and indexes hundreds of ads.
2. **Deconstructs** every creative with **Gemini Pro Vision** — extracting the hook, the scene flow, the text overlays, the CTA, the palette, the audience proxy.
3. **Clusters** the corpus into archetypes via signal-weighted scoring (SoV velocity, derivative spread, freshness, network diversity).
4. **Scores** each archetype against the target Game DNA on visual / mechanic / audience axes (Claude Opus 4.7).
5. **Authors** per-archetype creative briefs with explicit **audio directives** (bespoke brainrot narration scripts, no LoRem).
6. **Renders** 3 hero frames via **Scenario (gpt-image-2)**, then **3 parallel 5-second Kling i2v video calls**, with explicit `firstFrame` / `lastFrame` chaining on the final clip so it transitions seamlessly into the **pre-generated game-specific endcard**.
7. **Mixes** a multi-layer audio track via `ffmpeg filter_complex`: music bed (auto-ducked to 25%) + Opus-authored narration → OpenAI TTS + timestamp-spliced game SFX.
8. **Outputs** an 18-second branded MP4 ready to upload to Meta Ads / TikTok.

The killer feature: every Gemini call is **persisted in a knowledge base** keyed by `creative_id`. The first analysis pays Gemini, every subsequent one (cross-game, cross-week, cross-machine) hits disk in <10 ms. After the hackathon we shipped the repo with **499 ads pre-deconstructed** — a fresh clone gets the moat for free.

---

## The methodology — how we actually pick winners

### 1 · Market scan & trend signals

We don't just rank by raw Share-of-Voice. SensorTower's top-creatives feed is heavily skewed to long-running brand campaigns; what a Voodoo PM actually needs is **what's working *right now*** in their category. So we score every creative on a weighted composite of four signals:

| Signal | What it captures | Source |
|---|---|---|
| **`sov_velocity`** | 4-week derivative of share-of-voice for the *advertiser*. Positive velocity = the creative's parent campaign is gaining ground; negative = decaying. | `/v1/unified/ad_intel/network_analysis` per app_id, sliced into rolling weekly buckets. |
| **`derivative_spread`** | Variance of velocity *across networks*. High spread = the campaign is exploding on one network and flat on others (signal of channel-specific virality). Low spread = uniform, less informative. | Computed from the same series, network-level slices. |
| **`freshness`** | Days since `first_seen_at`. Decay function: full weight ≤ 7 days, half-weight at 30 days, ~0 at 90 days. Catches "this hook just launched and is already top-N". | `ad_unit.first_seen_at` from creatives_top. |
| **`network_diversity`** | Number of distinct networks running the same `phashion_group` (visual hash). Genuine winners propagate across Meta / TikTok / AppLovin. Single-network outliers are usually network-specific tests. | `phashion_group` + `network` fields. |

Final score is `(0.45 × velocity_norm) + (0.20 × spread_norm) + (0.20 × freshness_norm) + (0.15 × diversity_norm)`. The weights were tuned empirically against the Voodoo benchmark of 14 ads we manually labelled "winner" / "tester" / "decay". Implementation in [`app/analysis/archetypes.py`](app/analysis/archetypes.py).

This is **why we don't just hand the PM a top-50 list** — the platform surfaces the 5–8 ads where the signal genuinely justifies attention, with the score components transparent on every card.

### 2 · Gemini deconstruction — the moat

Every selected creative goes through **Gemini 2.5 Pro Vision** (1M context, native multi-frame video understanding). The prompt asks for a **structured Pydantic schema** so we never deal with prose:

```python
class DeconstructedCreative(BaseModel):
    creative_id: str
    hook_frame: HookFrame                # 0-3s: visual subject + spoken hook + on-screen text
    scene_flow: list[SceneBeat]          # 5-8 beats with timestamps + camera + action
    text_overlays: list[TextOverlay]     # every text-on-frame with timing + position
    voiceover_transcript: str | None     # full transcript when audio present
    cta_frame: CtaFrame                  # the final-2s endcard structure
    palette: ColorPalette                # 5 dominant colors with hex + role
    emotional_pitch: Literal[
        "satisfaction", "fail", "curiosity", "social-proof",
        "tutorial", "live-action-ugc", "in-game", "animation", "other",
    ]
    archetype_label: str                 # free-form, e.g. "live-action UGC reaction"
    audience_proxy: str                  # "20-something casual gamer, browsing TikTok"
    pacing_score: float                  # 0-1, normalized scene-cuts-per-second
```

Each deconstruction is written to `data/cache/deconstruct/<creative_id>.json` and **never recomputed**. After the hackathon, our knowledge base has **499 creatives × ~3 KB each ≈ 2 MB of structured market intelligence** that grew from zero in 48 hours of pipeline runs. A `scripts/scan_top_competitors.py` cron keeps it fresh weekly.

This is what makes the second analysis on a Voodoo title **10× cheaper than the first** — the per-archetype clustering reads from disk instead of re-paying Gemini.

### 3 · Brief generation — Opus with explicit audio directives

The clustering step picks the 3 archetypes that score highest **for this specific game** (game-fit ranker, also Opus, scoring on visual / mechanic / audience axes). Each goes to a **separate Opus 4.7 call** that produces a fully-typed `CreativeBrief`:

- 3 storyboard frames (each with prompt for Scenario, plus negative prompt)
- per-frame text overlays
- final CTA copy
- **`audio_directive`**: the punchline of the prompt
  - `vibe_track`: which emotional pitch to match for the music bed
  - `narration_script`: bespoke 3-sentence brainrot script Opus writes specifically for the variant — short cadence, punchy nouns, set up + reveal + CTA
  - `sfx_cues`: 3-5 timestamped game-feel sound effects (`whoosh @ 1.2s`, `drop @ 4.8s`, `chime @ 17.5s`)

The audio directive is what lets us produce ads that sound like *Voodoo* ads (high-tempo, casual-arcade) and not generic AI slop. Without it, the TTS reads the text overlays robotically and the music feels glued on — we tested both.

### 4 · Video generation — 3 parallel calls + first/last frame chain

This is the part the jury asked the most about. The pipeline takes one brief and renders an 18-second branded ad in roughly 3 minutes:

```
                      ┌─────── Scenario gpt-image-2 (parallel ×3) ───────┐
                      │                                                   │
brief.frame_prompts ──┼── frame_0.png ──┐                                 │
                      ├── frame_1.png ──┼─── 3 hero frames (1080×1920)    │
                      └── frame_2.png ──┘                                 │
                                                                          │
                      ┌─────── Kling i2v (parallel ×3) ──────────────────┘
                      │
clip_0  =  i2v(frame_0)                              ← 5s, no constraints
clip_1  =  i2v(frame_1)                              ← 5s, no constraints
clip_2  =  i2v(                                      ← 5s, BUT:
              firstFrameImage = frame_2,
              lastFrameImage  = endcard_first_frame  ← grafts onto the endcard
          )
                      │
                      ▼
ffmpeg concat:  clip_0  ⊕  clip_1  ⊕  clip_2  ⊕  endcard.mp4    (18s total)
                      │
                      ▼
ffmpeg filter_complex (multi-layer audio mix — section 5)
                      │
                      ▼
                 final.mp4
```

The **first/last-frame chaining on `clip_2`** is the trick that gives us a seamless cut into the branded endcard. Kling's i2v supports passing both `firstFrameImage` and `lastFrameImage` (in **Fast** mode — Rich/2.6-Pro mode rejects the combo when `generateAudio=true`, so we accept a hard cut there in exchange for native diegetic audio). We extract the endcard's first frame at pipeline-init time and reuse it across every variant for the same game.

Implementation in [`app/creative/scenario.py`](app/creative/scenario.py) (the API client) and [`api/main.py:render_variant_video`](api/main.py) (the orchestrator).

### 5 · Audio mixing — multi-layer ffmpeg `filter_complex`

This was the most fun debugging session of the hackathon. Three layers, all mixed into one stereo track:

| Layer | Source | Volume | Strategy |
|---|---|---|---|
| **Music bed** | Stock track from `data/cache/audio/library/<vibe>.mp3` (Pixabay CC0). The vibe is picked from the brief's `emotional_pitch` (`satisfaction` → energetic chiptune, `fail` → comedic glitch, `live-action-ugc` → upbeat lo-fi, etc). | 25% | Looped to video duration with `apad=whole_dur=...` so it never truncates. **Auto-ducks** to 25% the moment voice is enabled. |
| **Voiceover** | OpenAI TTS (`alloy` voice) reading the **Opus-authored bespoke narration** — *not* the text overlays. The narration is cached on disk per `(brief_hash, voice_id)` so re-rolls are free. | 100% | Padded with silence to the full video duration so `amix` can't drop early. |
| **Game SFX** | 5 short stems (`whoosh.mp3`, `swoosh.mp3`, `drop.mp3`, `chime.mp3`, `brand.mp3`) timestamp-spliced at the brief's `sfx_cues`. | 80% | Each splice uses `adelay=<ms>|<ms>` to hit the correct beat, then `apad` + `atrim` to align. |

The full filter graph is built dynamically — every layer that's enabled gets its own input slot, its own chain, and a label that goes into the final `amix=inputs=N`. The previously-painful bug was using `-shortest`, which truncated the 18s video to the 4s narration; we now `apad` every audio source to video length and let amix do its thing. Implementation in [`api/main.py:_try_apply_audio_layers`](api/main.py).

The result: every ad sounds bespoke. The PM keeps three toggles in the UI (Music / Voice / SFX) and can flip combinations live during a test session — 20 seconds end-to-end per re-mix because the silent video stays cached.

### 6 · Endcards — pre-generated, animated, per-game

Every Voodoo title gets a **branded endcard** generated *once* and reused across every variant:

<div align="center">

| Static frame (GPT Image 2) | Animated (Kling i2v, 3s) |
|:---:|:---:|
| <img src="docs/screenshots/voodradar-endcard-static.png" alt="Crowd City endcard — static" width="220"> | <img src="docs/screenshots/voodradar-endcard-animation.gif" alt="Crowd City endcard — animated" width="220"> |
| **Step 1**: GPT Image 2 receives the game's icon + Game DNA palette + a fixed prompt template ("mobile game endcard, [game] logo centered, 'Play Now' CTA button, App Store badge, [palette] background, vertical 9:16"). Output cached as PNG. | **Step 2**: Kling i2v animates it into a 3-second loop (subtle parallax + CTA pulse). Cached as MP4. The first frame is what `clip_2` of every variant grafts onto via `lastFrameImage`. |

</div>

Pipeline scripts: [`scripts/generate_endcards.py`](scripts/generate_endcards.py) for the static gen, [`scripts/animate_endcards.py`](scripts/animate_endcards.py) for the animation pass (with auto-trim of the empty 2 last seconds + 429 backoff). The `--all` flag is idempotent — already-animated games are skipped.

We pre-generated 14 endcards covering every Voodoo title in our demo set. Adding a new one is `uv run python -m scripts.generate_endcards --game "Subway Surfers" && uv run python -m scripts.animate_endcards --game "Subway Surfers"`.

---

## Architecture

```
                  ┌─────────────────────────────────────────┐
                  │  Frontend (React + TanStack Router)     │
                  │  /  /voodoo  /ads  /insights  /weekly   │
                  │  /competitive  /competitor/$appId       │
                  │  /performance  /geo  /ad/$id            │
                  └─────────────────┬───────────────────────┘
                                    │ HTTP + Server-Sent Events
                  ┌─────────────────▼───────────────────────┐
                  │  FastAPI bridge  (api/main.py)          │
                  │  /api/report  /api/variants/render-video│
                  │  /api/weekly-report  /api/creatives/{id}│
                  │  /api/competitor/{app_id}               │
                  │  /api/report/run/stream  (SSE pipeline) │
                  └────┬───────┬──────┬──────┬──────────────┘
                       │       │      │      │
                       ▼       ▼      ▼      ▼
              ┌───────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
              │SensorTower│ │Gemini│ │Opus  │ │Scenario  │
              │ ad-intel  │ │ Pro  │ │ 4.7  │ │img + i2v │
              └─────┬─────┘ └───┬──┘ └───┬──┘ └─────┬────┘
                    │           │        │          │
                    └───────────┴────────┴──────────┘
                                     │
                            ┌────────▼─────────────────┐
                            │      data/cache/         │
                            │  reports/    game_dna/   │
                            │  briefs/     deconstruct/│
                            │  endcards/   videos/     │
                            │  audio/      scenario/   │
                            │  voodoo/     sensortower/│
                            └──────────────────────────┘
```

**Knowledge base** (`data/cache/deconstruct/`) is the moat: every Gemini call keyed by `creative_id`, cached forever. The first analysis pays Gemini, every subsequent one hits disk in <10 ms. A weekly cron of `scripts/scan_top_competitors.py` keeps it fresh.

---

## Repo layout

```
api/main.py                      # FastAPI: 13 endpoints + SSE pipeline runner
app/
├── models.py                    # Pydantic data contract (the lingua franca)
├── pipeline.py                  # 10-step pipeline orchestrator
├── analysis/
│   ├── game_dna.py              # SensorTower meta + Gemini Vision on screenshots
│   ├── deconstruct.py           # Gemini Pro Vision per-creative dossier
│   ├── archetypes.py            # signal-weighted clustering (velocity / spread / freshness)
│   └── game_fit.py              # Opus per-archetype game-fit scoring
├── creative/
│   ├── brief.py                 # Opus brief authoring with audio directives
│   ├── scenario.py              # Scenario REST client (img + i2v + lastFrame chaining)
│   └── video_brief.py           # Veo 3 alt path
└── sources/
    ├── sensortower.py           # SensorTower /ad_intel + /search wrapper
    └── voodoo.py                # Voodoo catalog harvester (50 games)

front/                           # React app (TanStack Router + Tailwind + shadcn/ui)
├── src/components/dashboard/    # Page-level views (Insights, AdLibrary, …)
├── src/components/insights/     # GeneratedAdSection, LiveAnalysisView, …
├── src/lib/                     # API hooks + game / pipeline-runs context
└── src/routes/                  # File-based routing (incl. /competitor/$appId)

scripts/
├── precache.py                  # Pre-bake a HookLensReport for one game
├── precache_voodoo_ads.py       # Snapshot the 50-game Voodoo portfolio
├── scan_top_competitors.py      # Backfill the deconstruction knowledge base
├── generate_endcards.py         # GPT Image 2 → branded endcard PNG
├── animate_endcards.py          # Kling i2v → animated 3-second endcard MP4
└── generate_demo_video.py       # CLI multi-clip ad assembly (pre-React)

data/cache/                      # All cached state (selectively gitignored)
├── reports/                     # 16 cached HookLensReports (~440 KB)
├── deconstruct/                 # 499 Gemini deconstructions (~2 MB) ⭐ THE MOAT
├── endcards/                    # 14 game endcards (PNG + 3-second MP4)
├── voodoo/                      # 50-game catalog + portfolio snapshot
├── sensortower/                 # Raw SensorTower API responses
├── audio/library/               # Stock music keyed by emotional pitch
├── audio/sfx/                   # Game SFX stems
└── audio/tts/                   # OpenAI TTS cache
```

---

## Running locally

### Prerequisites

- Python 3.12 (pinned in `.python-version`)
- [`uv`](https://github.com/astral-sh/uv) for package management
- Node 20+ for the frontend
- `ffmpeg` + `ffprobe` on `$PATH`
- API keys in `.env`:
  - `SENSORTOWER_API_KEY`
  - `GEMINI_API_KEY` (Gemini Pro Vision)
  - `ANTHROPIC_API_KEY` (Claude Opus 4.7)
  - `SCENARIO_API_KEY` + `SCENARIO_API_SECRET` (image + video generation)
  - `OPENAI_API_KEY` (TTS voiceovers)

### One-liner setup

```bash
uv pip install -e ".[dev]"
cd front && npm install --legacy-peer-deps && cd ..

# Terminal 1 — backend
uv run uvicorn api.main:app --reload --port 8000

# Terminal 2 — frontend
cd front && npm run dev          # → http://localhost:8080
```

The cached state ships with the repo (~30 MB), so a fresh clone has 16 analyzed games + 499 deconstructed ads + 14 brand endcards available **without paying any API**.

### Re-running the full pipeline on a new game

```bash
uv run python -m scripts.precache "Subway Surfers"
```

Burns ~$0.50–$1 in API calls and takes 3–5 minutes. The result lands in `data/cache/reports/<app_id>_e2e.json` and shows up in the React UI immediately.

### Refreshing the knowledge base

```bash
uv run python -m scripts.scan_top_competitors --concurrency 5
```

Walks every cached SensorTower creative, deconstructs the ones not yet in the knowledge base. Idempotent — second run is a no-op.

---

## Demo paths

- **Hero report** → http://localhost:8080/insights → "Crowd City"
  (16 cached reports available; Crowd City has the most polished variants + a hand-rendered endcard).
- **Generate Ad** → on any cached report, click **Generate Ad** in the "Generated ad video" section. With the Scenario clips already cached the assembly takes ~30 s instead of 5 min.
- **Knowledge base** → http://localhost:8080/weekly → 499 deconstructed ads, distribution by emotional pitch, click any tile for its Gemini dossier on `/ad/<id>`.
- **Competitor deep-dive** → http://localhost:8080/competitive → click any top advertiser → live SensorTower fetch of their full ad inventory + cached deconstructions.

---

## Tech stack

| Layer | Tool |
|---|---|
| Backend | Python 3.12 · FastAPI · Pydantic 2 · httpx async · asyncio + Semaphore |
| Frontend | React 19 · Vite · TanStack Router · TanStack Query · Tailwind CSS · shadcn/ui |
| Data | SensorTower (ad-intel + search + apps) · App Store screenshots (CDN) |
| AI | Gemini 2.5 Pro Vision · Claude Opus 4.7 · OpenAI TTS · Scenario (gpt-image-2 + Kling O1/2.6-Pro i2v + Veo 3) |
| Video | ffmpeg (concat demuxer + filter_complex amix) |
| Audio | OpenAI TTS · Pixabay CC0 / Mixkit no-attribution |
| Caching | Flat JSON files keyed by creative_id / app_id / archetype / hash |
| Streaming | Server-Sent Events for live pipeline progress |

---

## Credits

Built for **Voodoo Hack 2026** in 30 hours by team Edouard / Tooom / partners, on Anthropic credits, Google AI credits, and Scenario beta access. SensorTower data used under hackathon-sponsor credentials.

Audio assets in `data/cache/audio/library/` — royalty-free Pixabay CC0 tracks: [Bonkers for Arcades](https://pixabay.com/music/upbeat-bonkers-for-arcades-271755/), [Powerful Energetic Sport Rock](https://pixabay.com/music/upbeat-powerful-energetic-sport-rock-trailer-274290/), [Vlog Beat](https://pixabay.com/music/upbeat-vlog-beat-2-186044/), and 4 others mapped to emotional-pitch slots in `data/cache/audio/library/README.md`.

🏆 **Track 3 — Market Intelligence — 1st place — Voodoo Hack 2026.**
