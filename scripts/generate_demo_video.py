"""Generate a demo ad video from a cached HookLensReport.

Takes a report's top variant (priority #1), downloads its hero +
storyboard frames locally, and feeds them as a keyframe sequence to one
of Scenario's video-capable models. The resulting mp4 is saved under
``data/cache/videos/demo_<game>.mp4``.

Usage::

    # Default: model_scenario-image-seq-to-video (sequence keyframe → video)
    uv run python -m scripts.generate_demo_video data/cache/reports/6754558455_e2e.json

    # Force a specific Scenario video model
    uv run python -m scripts.generate_demo_video <report> --model model_kling-v2-6-i2v-pro

    # Use a different variant (default 0 = top priority)
    uv run python -m scripts.generate_demo_video <report> --variant-idx 1

The single-image models (Kling i2v / Veo i2v / Luma i2v) only consume
the hero frame and ignore the storyboards. The sequence model uses all
3 frames as keyframes and interpolates between them.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv

load_dotenv(REPO_ROOT / ".env")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)

import httpx

from app._paths import CACHE_DIR

VIDEOS_DIR = CACHE_DIR / "videos"
TMP_FRAMES_DIR = CACHE_DIR / "scenario_frames"


def _slugify(text: str) -> str:
    import re

    return re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_-").lower() or "demo"


def _download(url: str, dest: Path) -> Path:
    """Fetch ``url`` to ``dest`` (creating parents). Follows redirects."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", help="Path to a cached HookLensReport JSON")
    parser.add_argument(
        "--variant-idx",
        type=int,
        default=0,
        help="Which final_variants[] to videofy (default: 0 = top priority)",
    )
    parser.add_argument(
        "--model",
        default="model_scenario-image-seq-to-video",
        help="Scenario video model_id. Defaults to the sequence-to-video model.",
    )
    parser.add_argument(
        "--prompt",
        default=None,
        help="Optional prompt override. If absent, derived from the brief's hook_3s.",
    )
    args = parser.parse_args()

    report_path = Path(args.report)
    if not report_path.exists():
        print(f"ERROR: report file not found: {report_path}")
        return 1

    report = json.loads(report_path.read_text())
    target = report.get("target_game", {})
    name = target.get("name", "demo")
    variants = report.get("final_variants") or []
    if args.variant_idx >= len(variants):
        print(f"ERROR: variant-idx {args.variant_idx} out of range ({len(variants)} variants)")
        return 1

    variant = variants[args.variant_idx]
    brief = variant.get("brief") or {}
    title = brief.get("title", "untitled")
    hook = brief.get("hook_3s") or ""
    prompt = args.prompt or hook

    hero = variant.get("hero_frame_path") or ""
    storyboard = variant.get("storyboard_paths") or []
    frame_urls = [u for u in [hero, *storyboard] if u]

    if not frame_urls:
        print("ERROR: variant has no hero/storyboard images to videofy")
        return 1

    # Single-image models only need the hero frame.
    is_single_image_model = "i2v" in args.model and "seq" not in args.model
    if is_single_image_model:
        frame_urls = frame_urls[:1]

    print(
        f"\n{'=' * 70}\n"
        f"Generating demo video for: {name}\n"
        f"  Brief: {title!r}\n"
        f"  Hook: {hook[:80]}\n"
        f"  Model: {args.model}\n"
        f"  Frames: {len(frame_urls)} (hero{'+' + str(len(storyboard)) + ' storyboard' if not is_single_image_model and storyboard else ''})\n"
        f"{'=' * 70}"
    )

    # Download frames locally so call_scenario_video can hash + upload them.
    slug = _slugify(name)
    frames_dir = TMP_FRAMES_DIR / slug
    frames_dir.mkdir(parents=True, exist_ok=True)
    local_frames: list[Path] = []
    for i, url in enumerate(frame_urls):
        dest = frames_dir / f"frame_{i:02d}.png"
        if not dest.exists() or dest.stat().st_size == 0:
            print(f"  ↓ downloading frame {i + 1}/{len(frame_urls)} → {dest.name}")
            _download(url, dest)
        else:
            print(f"  ✓ frame {i + 1}/{len(frame_urls)} cached: {dest.name}")
        local_frames.append(dest)

    # Generate video.
    from app.creative.scenario import call_scenario_video

    print(f"\n→ Calling Scenario video API (timeout 12 min)…")
    t0 = time.perf_counter()
    try:
        video_url, meta = call_scenario_video(
            model_id=args.model,
            image_paths=local_frames,
            prompt=prompt,
            label=f"demo_{slug}",
        )
    except Exception as e:
        print(f"\n✗ Video generation failed: {e}")
        return 1
    elapsed = time.perf_counter() - t0

    if meta.get("stub"):
        print(
            f"\n⚠ Generation returned a stub (reason={meta.get('stub_reason')}). "
            f"Job ID {meta.get('job_id')} may still complete in Scenario's queue."
        )
        return 1

    # Download the mp4 next to the report.
    output_path = VIDEOS_DIR / f"demo_{slug}.mp4"
    print(f"\n↓ downloading mp4 → {output_path}")
    _download(video_url, output_path)
    size_kb = output_path.stat().st_size / 1024

    print(
        f"\n{'=' * 70}\n"
        f"DONE — generated in {elapsed:.0f}s · {size_kb:.0f} KB · job {meta.get('job_id')}\n"
        f"{'=' * 70}\n"
        f"  Output:   {output_path}\n"
        f"  Preview:  open {output_path}\n"
        f"  CDN URL:  {video_url}\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
