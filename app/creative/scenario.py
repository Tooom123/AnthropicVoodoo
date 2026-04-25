"""Scenario REST API client for asset generation.

Owner: Partner 2. The production target uses the **Scenario MCP** connector
inside Claude Code; this module is the v1 REST baseline so the Streamlit
pipeline runs end-to-end from Python.

API auth: Basic with ``API_KEY:API_SECRET`` base64-encoded.
Workflow: POST ``/v1/generate/txt2img`` returns a jobId; poll ``/v1/jobs/{id}``
until ``status == "success"``, then read ``assetIds`` from the job metadata
and fetch each asset via ``/v1/assets/{id}``.

If credentials are missing, ``call_scenario`` falls back to a deterministic
Picsum URL so the rest of the pipeline still completes end-to-end.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from pathlib import Path

import httpx

from app._cache import disk_cached, hash_key
from app._paths import CACHE_DIR
from app.models import CreativeArchetype, CreativeBrief, GameFitScore, GeneratedVariant

log = logging.getLogger(__name__)

SCENARIO_BASE = "https://api.cloud.scenario.com/v1"
DEFAULT_MODEL_ID = "flux.1-dev"
DEFAULT_CACHE_DIR = CACHE_DIR / "scenario"


def _basic_auth_header() -> str | None:
    key = os.environ.get("SCENARIO_API_KEY")
    sec = os.environ.get("SCENARIO_API_SECRET")
    if not (key and sec):
        return None
    raw = f"{key}:{sec}".encode()
    return f"Basic {base64.b64encode(raw).decode()}"


def _picsum_stub(prompt: str) -> str:
    seed = abs(hash(prompt)) % 10**6
    return f"https://picsum.photos/seed/{seed}/720/1280"


def call_scenario(
    prompt: str,
    *,
    label: str = "asset",
    model_id: str = DEFAULT_MODEL_ID,
    width: int = 720,
    height: int = 1280,
    timeout_s: float = 360.0,
) -> tuple[str, dict]:
    """Generate one image via Scenario REST API.

    Returns ``(asset_url, metadata_dict)``. ``metadata_dict["stub"]`` is True
    when credentials are missing or when generation timed out (graceful
    degradation: the pipeline continues with a Picsum placeholder rather
    than crashing on a single slow asset).

    On timeout, the failure is *not* cached — re-running may succeed if
    Scenario's queue has cleared.

    Cached on disk by ``(prompt, model_id)`` so successful re-runs are instant.
    """
    cache_path = DEFAULT_CACHE_DIR / f"{label}__{hash_key({'p': prompt, 'm': model_id})}.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        return cached["url"], cached

    auth = _basic_auth_header()

    # Stub path — no credentials.
    if not auth:
        url = _picsum_stub(prompt)
        result = {"url": url, "stub": True, "prompt": prompt, "model_id": model_id}
        DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(result, indent=2))
        return url, result

    headers = {"Content-Type": "application/json", "Authorization": auth}
    payload = {
        "prompt": prompt,
        "modelId": model_id,
        "numSamples": 1,
        "numInferenceSteps": 28,
        "guidance": 3.5,
        "width": width,
        "height": height,
    }

    log.info("Scenario CACHE MISS · POST /generate/txt2img · model=%s", model_id)
    r = httpx.post(
        f"{SCENARIO_BASE}/generate/txt2img",
        headers=headers,
        json=payload,
        timeout=60.0,
    )
    r.raise_for_status()
    job_id = r.json()["job"]["jobId"]

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        rr = httpx.get(
            f"{SCENARIO_BASE}/jobs/{job_id}",
            headers={"Authorization": auth},
            timeout=30.0,
        )
        rr.raise_for_status()
        body = rr.json()
        status = body["job"]["status"]

        if status == "success":
            asset_ids = (body["job"].get("metadata") or {}).get("assetIds") or []
            if not asset_ids:
                raise RuntimeError("Scenario job succeeded but no assetIds returned")

            asset_id = asset_ids[0]
            ar = httpx.get(
                f"{SCENARIO_BASE}/assets/{asset_id}",
                headers={"Authorization": auth},
                timeout=30.0,
            )
            ar.raise_for_status()
            ar_body = ar.json()
            asset_url = (
                (ar_body.get("asset") or {}).get("url")
                or ar_body.get("url")
                or ""
            )
            result = {
                "url": asset_url,
                "job_id": job_id,
                "asset_id": asset_id,
                "stub": False,
                "prompt": prompt,
                "model_id": model_id,
            }
            DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(result, indent=2))
            return asset_url, result

        if status in ("failure", "canceled"):
            raise RuntimeError(f"Scenario job ended with status={status}")

        time.sleep(3.0)

    # Graceful degradation on timeout — return a Picsum placeholder so the
    # pipeline can complete. Do NOT cache: a future re-run may succeed once
    # Scenario's queue clears. The job_id is kept in metadata so the user can
    # check the Scenario dashboard manually for the eventual asset.
    log.warning(
        "Scenario job %s timed out after %.0fs — falling back to placeholder. "
        "Re-run later to retry; the job may still complete in Scenario's queue.",
        job_id,
        timeout_s,
    )
    fallback_url = _picsum_stub(prompt)
    return fallback_url, {
        "url": fallback_url,
        "stub": True,
        "stub_reason": "scenario_timeout",
        "job_id": job_id,
        "prompt": prompt,
        "model_id": model_id,
    }


def generate_variants(
    chosen: list[tuple[CreativeArchetype, GameFitScore]],
    briefs: list[CreativeBrief],
    *,
    model_id: str = DEFAULT_MODEL_ID,
) -> list[GeneratedVariant]:
    """For each brief, generate one hero frame + storyboard via Scenario.

    ``test_priority`` is a final ranking by ``signal_score × game_fit / 100``
    so the publishing team knows which variant to A/B-test first.
    """
    variants: list[GeneratedVariant] = []

    for arch, sc in chosen:
        brief = next(b for b in briefs if b.archetype_id == arch.archetype_id)
        urls: list[str] = []
        for j, prompt in enumerate(brief.scenario_prompts):
            url, _meta = call_scenario(
                prompt,
                label=f"{brief.archetype_id}_{j}",
                model_id=model_id,
            )
            urls.append(url)

        hero = urls[0] if urls else ""
        storyboard = urls[1:] if len(urls) > 1 else []

        priority_score = arch.overall_signal_score * (sc.overall / 100.0)
        variants.append(
            GeneratedVariant(
                brief=brief,
                hero_frame_path=hero,
                storyboard_paths=storyboard,
                test_priority=0,  # set below
                test_priority_rationale=(
                    f"signal_score={arch.overall_signal_score:.2f} × "
                    f"game_fit={sc.overall}/100 ⇒ priority={priority_score:.2f}"
                ),
            )
        )

    # Final ranking by combined score
    variants.sort(
        key=lambda v: float(v.test_priority_rationale.split("priority=")[-1]),
        reverse=True,
    )
    for i, v in enumerate(variants, start=1):
        v.test_priority = i

    return variants
