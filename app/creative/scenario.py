"""Scenario REST API client for asset generation.

Owner: Partner 2. The production target uses the **Scenario MCP** connector
inside Claude Code; this module is the v1 REST baseline so the Streamlit
pipeline runs end-to-end from Python.

Three generation modes (auto-selected based on inputs):

- ``txt2img``: pure prompt-driven. No reference image.
- ``txt2img-ip-adapter`` (default when refs provided): prompt-driven
  composition with **IP-Adapter style transfer** from 1-3 game screenshots.
  This is the right tool for "ad creative that stays on-brand" — the prompt
  drives the narrative, the references inject palette + character + UI vibe
  without locking the canvas. Anti-deceptive-ad strategy.
- ``img2img`` (opt-in via ``img2img_strength=...``): single-reference
  composition lock. Useful when one screenshot must define the layout
  exactly (rare for ads — kept for flexibility).

API auth: Basic with ``API_KEY:API_SECRET`` base64-encoded.

Async workflow: trigger → jobId → poll ``/v1/jobs/{id}`` until success →
read ``assetIds`` from job metadata → fetch each asset via ``/v1/assets/{id}``.

If credentials are missing, ``call_scenario`` falls back to a deterministic
Picsum URL so the rest of the pipeline still completes end-to-end.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import time
from pathlib import Path

import httpx

from app._cache import hash_key
from app._paths import CACHE_DIR
from app.models import CreativeArchetype, CreativeBrief, GameFitScore, GeneratedVariant

log = logging.getLogger(__name__)

SCENARIO_BASE = "https://api.cloud.scenario.com/v1"
DEFAULT_MODEL_ID = "flux.1-dev"
DEFAULT_CACHE_DIR = CACHE_DIR / "scenario"
ASSETS_CACHE_DIR = CACHE_DIR / "scenario_assets"
DEFAULT_IMG2IMG_STRENGTH = 0.6  # 0.0 = identical to reference, 1.0 = ignore reference
MAX_IPADAPTER_REFS = 3  # Scenario / Veo / most IP-Adapter models cap quality at 3 refs


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


def upload_asset(image_path: Path, *, name: str | None = None) -> str:
    """Upload a local image to Scenario and return its ``asset_id``.

    Cached by file hash on disk under ``data/cache/scenario_assets/<sha8>.txt``,
    so the same screenshot is uploaded at most once even across pipeline runs.
    """
    auth = _basic_auth_header()
    if not auth:
        raise RuntimeError(
            "SCENARIO_API_KEY/SECRET missing — cannot upload reference image."
        )

    image_bytes = image_path.read_bytes()
    sha = hashlib.sha256(image_bytes).hexdigest()[:16]
    cache_path = ASSETS_CACHE_DIR / f"{sha}.txt"
    if cache_path.exists():
        return cache_path.read_text().strip()

    log.info("Scenario asset upload (%d KB) for %s", len(image_bytes) // 1024, image_path.name)
    payload = {
        "image": base64.b64encode(image_bytes).decode("utf-8"),
        "name": name or image_path.name,
    }
    headers = {"Content-Type": "application/json", "Authorization": auth}
    r = httpx.post(
        f"{SCENARIO_BASE}/assets",
        headers=headers,
        json=payload,
        timeout=60.0,
    )
    r.raise_for_status()
    body = r.json()
    asset_id = (body.get("asset") or {}).get("id") or body.get("id") or body.get("assetId")
    if not asset_id:
        raise RuntimeError(f"Scenario /v1/assets returned no id: {body}")

    ASSETS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(asset_id)
    return asset_id


def call_scenario(
    prompt: str,
    *,
    label: str = "asset",
    model_id: str = DEFAULT_MODEL_ID,
    width: int = 720,
    height: int = 1280,
    timeout_s: float = 360.0,
    reference_image_paths: list[Path] | None = None,
    ipadapter_type: str = "style",  # "style" or "character"
    img2img_strength: float | None = None,  # if set, force img2img mode (single ref)
) -> tuple[str, dict]:
    """Generate one image via Scenario REST API. Mode auto-selected:

    - 0 refs                                 → ``txt2img``
    - 1+ refs, no ``img2img_strength``       → ``txt2img-ip-adapter`` (recommended for ad creatives)
    - exactly 1 ref + ``img2img_strength``   → ``img2img`` (composition lock, opt-in)

    Returns ``(asset_url, metadata_dict)``. ``metadata_dict["stub"]`` is True
    when credentials are missing or when generation timed out (graceful
    degradation: the pipeline continues with a Picsum placeholder rather
    than crashing on a single slow asset).

    On timeout, the failure is *not* cached — re-running may succeed if
    Scenario's queue has cleared.

    Cached on disk by all inputs that affect the output.
    """
    refs = reference_image_paths or []
    refs = refs[:MAX_IPADAPTER_REFS]  # cap

    if img2img_strength is not None and len(refs) >= 1:
        mode = "img2img"
    elif len(refs) >= 1:
        mode = "txt2img-ip-adapter"
    else:
        mode = "txt2img"

    cache_key = {
        "p": prompt,
        "m": model_id,
        "mode": mode,
        "refs": [
            hashlib.sha256(p.read_bytes()).hexdigest()[:16] for p in refs
        ],
        "strength": img2img_strength,
        "ipa_type": ipadapter_type if mode == "txt2img-ip-adapter" else None,
    }
    cache_path = DEFAULT_CACHE_DIR / f"{label}__{hash_key(cache_key)}.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        return cached["url"], cached

    auth = _basic_auth_header()

    # Stub path — no credentials.
    if not auth:
        url = _picsum_stub(prompt)
        result = {
            "url": url,
            "stub": True,
            "prompt": prompt,
            "model_id": model_id,
            "mode": mode,
        }
        DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(result, indent=2))
        return url, result

    headers = {"Content-Type": "application/json", "Authorization": auth}

    # Build payload — same base for all 3 modes
    payload: dict = {
        "prompt": prompt,
        "modelId": model_id,
        "numSamples": 1,
        "numInferenceSteps": 28,
        "guidance": 3.5,
        "width": width,
        "height": height,
    }

    # Upload refs and add mode-specific fields
    endpoint = "/generate/txt2img"
    asset_ids: list[str] = []
    if mode != "txt2img":
        try:
            asset_ids = [
                upload_asset(p, name=f"ref_{label}_{i}")
                for i, p in enumerate(refs)
            ]
        except Exception as e:  # noqa: BLE001
            log.warning(
                "Scenario reference upload failed (%s) — falling back to txt2img.", e
            )
            mode = "txt2img"

    if mode == "img2img":
        payload["image"] = asset_ids[0]
        payload["strength"] = img2img_strength
        endpoint = "/generate/img2img"
    elif mode == "txt2img-ip-adapter":
        payload["ipAdapterImageIds"] = asset_ids
        payload["ipAdapterType"] = ipadapter_type
        endpoint = "/generate/txt2img-ip-adapter"

    log.info(
        "Scenario CACHE MISS · POST %s · model=%s%s",
        endpoint,
        model_id,
        (
            f" · {len(asset_ids)} ref(s) · type={ipadapter_type}"
            if mode == "txt2img-ip-adapter"
            else f" · ref={refs[0].name}, strength={img2img_strength}"
            if mode == "img2img"
            else ""
        ),
    )
    r = httpx.post(
        f"{SCENARIO_BASE}{endpoint}",
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
                "mode": mode,
                "reference_images": [p.name for p in refs] if refs else None,
                "img2img_strength": img2img_strength if mode == "img2img" else None,
                "ipadapter_type": ipadapter_type if mode == "txt2img-ip-adapter" else None,
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
    reference_image_paths: list[Path] | None = None,
    ipadapter_type: str = "style",
) -> list[GeneratedVariant]:
    """For each brief, generate one hero frame + storyboard via Scenario.

    When ``reference_image_paths`` is non-empty (typical: the target game's
    screenshots), uses **txt2img + IP-Adapter** to transfer the game's
    visual STYLE (palette, character/UI vibe) onto each prompt-driven
    composition. This is the right tool for ad creatives — palette match
    without composition lock — and prevents the "deceptive ad" problem
    where a generated visual looks nothing like the actual game.

    All available refs (capped at 3) are passed as IP-Adapter style refs
    for every scenario_prompt — every frame of the variant gets the full
    style anchor.

    ``test_priority`` is a final ranking by ``signal_score × game_fit / 100``
    so the publishing team knows which variant to A/B-test first.
    """
    variants: list[GeneratedVariant] = []
    refs = (reference_image_paths or [])[:MAX_IPADAPTER_REFS]

    for arch, sc in chosen:
        brief = next(b for b in briefs if b.archetype_id == arch.archetype_id)
        urls: list[str] = []
        for j, prompt in enumerate(brief.scenario_prompts):
            url, _meta = call_scenario(
                prompt,
                label=f"{brief.archetype_id}_{j}",
                model_id=model_id,
                reference_image_paths=refs,
                ipadapter_type=ipadapter_type,
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
