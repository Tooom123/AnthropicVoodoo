"""Generate brainrot-style video ad concept from GameDNA, then produce
the actual video via Scenario's video generation endpoint (model_veo3).

Flow:
  1. Claude Sonnet generates VideoAdConcept (concept + scenario_prompt + narration)
  2. scenario_prompt is submitted to Scenario POST /v1/generate/custom/model_veo3
  3. Job is polled until success → video asset URL returned

CREATIVE TREND NOTE: brainrot is hardcoded here as the active format for
hyper-casual UA (2026). When the trend changes, update _ACTIVE_TREND and
_build_prompt — no other code needs touching.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time

import anthropic
import httpx
from pydantic import BaseModel, Field

from app._cache import disk_cached, hash_key
from app._paths import CACHE_DIR
from app.models import GameDNA

log = logging.getLogger(__name__)

CACHE_DIR_CONCEPT  = CACHE_DIR / "video_briefs"
CACHE_DIR_VIDEO    = CACHE_DIR / "video_renders"
LLM_MODEL          = "claude-sonnet-4-6"
SCENARIO_BASE      = "https://api.cloud.scenario.com/v1"
VIDEO_MODEL_ID     = "model_xai-grok-imagine-video"
VIDEO_DURATION_S   = 8                     # seconds — Veo 3 free tier max
VIDEO_ASPECT_RATIO = "9:16"               # vertical mobile format
VIDEO_TIMEOUT_S    = 600.0                 # Veo 3 jobs can take several minutes

# ---------------------------------------------------------------------------
# Active creative trend — update this block when the market shifts
# ---------------------------------------------------------------------------

_ACTIVE_TREND = "BRAINROT"

_TREND_RULES = """\
MANDATORY CREATIVE TREND: BRAINROT
Brainrot-style mobile ads are the #1 performing hook format on TikTok,
Instagram Reels and Meta for hyper-casual in 2026.

REFERENCE EXAMPLES (match this energy exactly):

EXAMPLE 1 — hole.io:
scenario_prompt: "Hyper-casual first-person POV gameplay: a black hole tears
across a photorealistic map of Earth at insane speed, swallowing entire cities,
cars, skyscrapers, mountains. Screen shakes violently with each gulp. Debris
spirals into the void. Scale escalates — continents get eaten. 9:16 vertical,
8 seconds, ultra-vivid colors, game UI overlay showing score skyrocketing."
narration: "Noooooo a hole is destroying the EARTH!! It just ate New York—
OH MY GOD it's eating EUROPE now!! THE WHOLE PLANET IS GOING IN!! This is
INSANE I can't stop watching AHHHHH"

EXAMPLE 2 — marble sort:
scenario_prompt: "First-person hyper-casual gameplay: camera positioned just
behind a fast-moving stream of glossy neon marble balls rushing directly at
the viewer, bouncing on a slick track. Two same-color marbles collide —
MASSIVE merge explosion with shimmering sparks. More and more merge
simultaneously. Chain reactions everywhere. Score multiplier explodes on
screen. 9:16 vertical, 8 seconds, vibrant neon palette."
narration: "Oh my god it's marble balls EVERYWHERE look at them GO — no way
that just MERGED — this is INSANE the chain reaction won't STOP — I literally
cannot put this down AHHH"

RULES for every output:
- Camera angle: first-person POV or extreme close-up behind the action
- Scale escalation: start big, end APOCALYPTIC within 8 seconds
- Specific SFX cues in the prompt (whoosh, crunch, shatter, pop, merge sound)
- Narration: unhinged enthusiastic voice, ALL CAPS for peak moments
- Include lively brainrot audio/SFX description in the scenario_prompt
- 9:16 vertical, 8 seconds, mobile game UI overlay visible
"""

# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------


class VideoAdConcept(BaseModel):
    """LLM-generated brainrot concept — step 1 of the pipeline."""

    title: str
    gameplay_hook: str
    concept: str
    scenario_prompt: str = Field(
        description="Ready-to-submit prompt for Scenario video generation (model_veo3)."
    )
    narration_script: str
    style_tags: list[str]


class VideoAdResult(BaseModel):
    """Final output after Scenario video generation — step 2."""

    concept: VideoAdConcept
    video_url: str
    stub: bool = False          # True when Scenario creds are missing or job timed out
    job_id: str | None = None


# ---------------------------------------------------------------------------
# Step 1 — LLM concept generation
# ---------------------------------------------------------------------------


def _build_concept_prompt(dna: GameDNA) -> str:
    mechanics = ", ".join(dna.key_mechanics) if dna.key_mechanics else "not specified"
    return f"""{_TREND_RULES}

TARGET GAME DNA:
- Name: {dna.name}
- Genre: {dna.genre} / {dna.sub_genre or 'n/a'}
- Core loop: {dna.core_loop}
- Key mechanics: {mechanics}
- Visual style: {dna.visual_style}
- Palette: primary {dna.palette.primary_hex}, secondary {dna.palette.secondary_hex}, accent {dna.palette.accent_hex}
- UI mood: {dna.ui_mood}
- Audience: {dna.audience_proxy}

Generate ONE {_ACTIVE_TREND} video ad concept for {dna.name}.

CRITICAL — scenario_prompt construction rules for Veo3:
1. Base it STRICTLY on {dna.name}'s actual core mechanic: "{dna.core_loop}"
2. Escalate the mechanic to apocalyptic extremes in 8 seconds
3. Camera: first-person POV or extreme close-up right behind the action
4. EMBED the brainrot narration as spoken dialogue using this exact format:
   A voice screams: "NOOOOO [reaction to mechanic]!! OH MY GOD [escalation]!! [peak chaos line]!! THIS IS INSANE AHHH"
   — the voice lines MUST reference what is visually happening in the game
5. Include explicit SFX cues: satisfying pops, crunches, whooshes tied to the mechanic
6. End with score counter exploding / UI going crazy on screen
7. Format: 9:16 vertical, 8 seconds, mobile game UI overlay, {dna.visual_style} style

The scenario_prompt is a SINGLE dense paragraph sent directly to Veo3.
It must read like a vivid movie scene description WITH the dialogue embedded.

narration_script: same lines as embedded in scenario_prompt, formatted as a standalone script.

Respond with ONLY a JSON object — no markdown, no explanation:
{{
  "title": "...",
  "gameplay_hook": "...",
  "concept": "...",
  "scenario_prompt": "...",
  "narration_script": "...",
  "style_tags": ["...", "..."]
}}"""


def generate_video_concept(dna: GameDNA) -> VideoAdConcept:
    """Generate (disk-cached) brainrot VideoAdConcept from GameDNA."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY missing")
    client = anthropic.Anthropic(api_key=api_key)
    prompt = _build_concept_prompt(dna)

    def _call() -> VideoAdConcept:
        resp = client.messages.create(
            model=LLM_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return VideoAdConcept.model_validate_json(raw.strip())

    return disk_cached(
        CACHE_DIR_CONCEPT,
        f"concept_{dna.app_id}",
        {"prompt": prompt},
        _call,
        parser=VideoAdConcept.model_validate_json,
    )


# ---------------------------------------------------------------------------
# Step 2 — Scenario video generation
# ---------------------------------------------------------------------------


def _auth_header() -> str | None:
    key = os.environ.get("SCENARIO_API_KEY")
    sec = os.environ.get("SCENARIO_API_SECRET")
    if not (key and sec):
        return None
    return f"Basic {base64.b64encode(f'{key}:{sec}'.encode()).decode()}"


def _stub_video_url(prompt: str) -> str:
    """Placeholder when Scenario creds are missing — a static mp4 sample."""
    seed = abs(hash(prompt)) % 9999
    # Use a reliable royalty-free sample that works in <video> tags
    return f"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"


def generate_scenario_video(concept: VideoAdConcept, *, project_id: str | None = None) -> VideoAdResult:
    """Submit concept.scenario_prompt to Scenario video API and poll for result.

    Disk-cached by prompt hash so re-runs skip the API call.
    Falls back gracefully when SCENARIO_API_KEY/SECRET are missing.
    """
    cache_key = {"prompt": concept.scenario_prompt, "model": VIDEO_MODEL_ID}
    cache_path = CACHE_DIR_VIDEO / f"video__{hash_key(cache_key)}.json"
    CACHE_DIR_VIDEO.mkdir(parents=True, exist_ok=True)

    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        return VideoAdResult(
            concept=concept,
            video_url=cached["video_url"],
            stub=cached.get("stub", False),
            job_id=cached.get("job_id"),
        )

    auth = _auth_header()
    if not auth:
        log.warning("SCENARIO_API_KEY/SECRET missing — returning stub video")
        stub_url = _stub_video_url(concept.scenario_prompt)
        cache_path.write_text(json.dumps({"video_url": stub_url, "stub": True}))
        return VideoAdResult(concept=concept, video_url=stub_url, stub=True)

    pid = project_id or os.environ.get("SCENARIO_PROJECT_ID", "")
    url = f"{SCENARIO_BASE}/generate/custom/{VIDEO_MODEL_ID}"
    if pid:
        url += f"?projectId={pid}"

    headers = {"Authorization": auth, "Content-Type": "application/json"}
    payload = {
        "prompt": concept.scenario_prompt,
        "duration": VIDEO_DURATION_S,
        "aspectRatio": VIDEO_ASPECT_RATIO,
        "resolution": "720p",
        "numOutputs": 1,
    }

    log.info("Scenario video CACHE MISS · POST %s", url)
    r = httpx.post(url, headers=headers, json=payload, timeout=60.0)
    r.raise_for_status()
    job_id = r.json()["job"]["jobId"]
    log.info("Scenario video job_id=%s — polling…", job_id)

    # Poll until done
    deadline = time.time() + VIDEO_TIMEOUT_S
    poll_headers = {"Authorization": auth}
    while time.time() < deadline:
        rr = httpx.get(f"{SCENARIO_BASE}/jobs/{job_id}", headers=poll_headers, timeout=30.0)
        rr.raise_for_status()
        body = rr.json()
        status = body["job"]["status"]

        if status == "success":
            asset_ids = (body["job"].get("metadata") or {}).get("assetIds") or []
            if not asset_ids:
                raise RuntimeError("Scenario video job succeeded but no assetIds")
            asset_id = asset_ids[0]
            ar = httpx.get(f"{SCENARIO_BASE}/assets/{asset_id}", headers=poll_headers, timeout=30.0)
            ar.raise_for_status()
            ar_body = ar.json()
            video_url = (
                (ar_body.get("asset") or {}).get("url")
                or ar_body.get("url")
                or ""
            )
            result = {"video_url": video_url, "stub": False, "job_id": job_id}
            cache_path.write_text(json.dumps(result))
            return VideoAdResult(concept=concept, video_url=video_url, job_id=job_id)

        if status in ("failure", "canceled"):
            raise RuntimeError(f"Scenario video job ended with status={status}")

        time.sleep(5.0)

    # Timeout — graceful degradation, do not cache
    log.warning("Scenario video job %s timed out after %.0fs", job_id, VIDEO_TIMEOUT_S)
    stub_url = _stub_video_url(concept.scenario_prompt)
    return VideoAdResult(concept=concept, video_url=stub_url, stub=True, job_id=job_id)


# ---------------------------------------------------------------------------
# Combined helper — concept + video in one call
# ---------------------------------------------------------------------------


def generate_video_brief(dna: GameDNA) -> VideoAdResult:
    """Full pipeline: concept generation → Scenario video. Both steps cached."""
    concept = generate_video_concept(dna)
    return generate_scenario_video(concept)
