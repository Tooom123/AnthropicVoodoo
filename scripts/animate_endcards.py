"""Animate static endcards into 3-5s mp4 clips via Scenario img2video.

Pairs with ``scripts/generate_endcards.py``. Reads each png in
``data/cache/endcards/`` and produces an mp4 with the same stem
that the ``/api/variants/render-video`` endpoint can append at the
end of every generated ad.

Usage::

    # All endcards that don't yet have an mp4 sibling
    uv run python -m scripts.animate_endcards --all

    # Single game
    uv run python -m scripts.animate_endcards --game "Crowd City"

    # Different motion model (default: Kling i2v which respects the still
    # composition very well — recommended for endcards)
    uv run python -m scripts.animate_endcards --all --model model_kling-o1-i2v

The animation prompt is intentionally minimal ("subtle camera push-in,
text bounce, brand confetti shimmer, 3 seconds") so the base composition
stays stable. Each clip is ~3-5 seconds — short enough to feel like a
clean closing beat, long enough to land the CTA.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
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
from app.creative.scenario import call_scenario_video

ENDCARDS_DIR = CACHE_DIR / "endcards"

DEFAULT_MODEL = "model_kling-o1-i2v"
DEFAULT_MOTION_PROMPT = (
    "Subtle camera push-in on the game logo with a soft sparkle/shimmer "
    "behind the wordmark. The CTA button gently pulses once. The "
    "background has a slow, almost imperceptible parallax. Brand-confident, "
    "premium mobile-ad endcard finish. 9:16 vertical, 3 seconds."
)


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def _resolve_target_pngs(args: argparse.Namespace) -> list[Path]:
    """Resolve --game / --all into the set of static endcards to animate."""
    if args.all:
        pngs = sorted(ENDCARDS_DIR.glob("*.png"))
        if not args.overwrite:
            pngs = [p for p in pngs if not (p.with_suffix(".mp4")).exists()]
        return pngs

    if args.game:
        # Resolve game name → app_id by reading the sidecar JSONs we wrote
        needle = args.game.strip().lower()
        for sidecar in ENDCARDS_DIR.glob("*.json"):
            try:
                meta = json.loads(sidecar.read_text())
            except Exception:
                continue
            if (
                str(meta.get("app_id") or "") == needle
                or (meta.get("name") or "").lower() == needle
            ):
                png = ENDCARDS_DIR / f"{meta['app_id']}.png"
                if png.exists():
                    return [png]
        # Fallback: assume input is already an app_id stem
        png = ENDCARDS_DIR / f"{args.game}.png"
        if png.exists():
            return [png]
        raise SystemExit(
            f"❌ No static endcard found for {args.game!r}. Run "
            f"scripts.generate_endcards on it first."
        )

    raise SystemExit("Pass --game <name|app_id> or --all")


def animate_one(
    png: Path,
    *,
    model: str,
    prompt: str,
    overwrite: bool,
) -> Path | None:
    out_mp4 = png.with_suffix(".mp4")
    if out_mp4.exists() and not overwrite:
        print(f"  ↪ {png.name} → cached {out_mp4.name}")
        return out_mp4

    print(f"  ✚ animating {png.name}")
    try:
        url, meta = call_scenario_video(
            model_id=model,
            image_paths=[png],
            prompt=prompt,
            label=f"endcard_anim_{png.stem}",
        )
    except Exception as exc:
        print(f"      ✗ {png.name}: {exc}")
        return None

    if meta.get("stub"):
        print(f"      ⚠ stub returned (job_id={meta.get('job_id')}). Skipping.")
        return None

    _download(url, out_mp4)
    print(f"      ✓ {out_mp4.name} ({out_mp4.stat().st_size / 1024:.0f} KB)")
    return out_mp4


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game",
        help="App_id (stem) or game name to animate. Mutually exclusive with --all.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Animate every static endcard png in data/cache/endcards/.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Scenario video model_id (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--prompt",
        default=DEFAULT_MOTION_PROMPT,
        help="Motion prompt. Keep it gentle — endcards work best with subtle motion.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-animate even when the mp4 sibling already exists.",
    )
    args = parser.parse_args()

    targets = _resolve_target_pngs(args)
    if not targets:
        print("Nothing to animate (all endcards already have an mp4 sibling).")
        return 0

    print(f"Animating {len(targets)} endcards via {args.model}…\n")
    failed = 0
    for png in targets:
        if animate_one(
            png,
            model=args.model,
            prompt=args.prompt,
            overwrite=args.overwrite,
        ) is None:
            failed += 1

    print(
        f"\n{'=' * 50}\n"
        f"DONE — {len(targets) - failed}/{len(targets)} animated mp4s\n"
        f"  Output: {ENDCARDS_DIR}\n"
        f"  These are auto-appended by /api/variants/render-video when the\n"
        f"  matching app_id has an mp4 in this directory.\n"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
