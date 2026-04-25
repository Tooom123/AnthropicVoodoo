"""Side-by-side Scenario model comparison harness.

Internal team tooling — NOT used by the production pipeline. The single-model
generator lives in :mod:`app.creative.scenario` (``generate_variants``) and
its public surface is unchanged.

This module fans the same ``CreativeBrief`` out across multiple Scenario
``model_id``s in parallel so the team can eyeball which base model produces
the most on-DNA visual for a given game. Reuses ``call_scenario`` verbatim
(prompt, IP-Adapter refs, mode auto-selection) — the only thing that varies
between calls is ``model_id``.

Outputs land under ``out_dir/<sanitized_model_id>/hero.png`` together with a
``summary.json`` describing the run and a static ``grid.html`` for
side-by-side review in the browser.
"""

from __future__ import annotations

import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

from app.creative.scenario import call_scenario
from app.models import CreativeBrief

log = logging.getLogger(__name__)

DEFAULT_MODELS_TO_COMPARE: list[tuple[str, str]] = [
    ("flux.1-dev", "Flux 1.0 dev"),
    ("flux.1-schnell", "Flux Schnell (fast)"),
    ("model-sdxl-1-0", "SDXL 1.0 base"),
    ("model-sdxl-lightning", "SDXL Lightning (fast)"),
    ("model-anime-xl", "Anime XL (stylized)"),
]

_SAFE_SLUG_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def _safe_slug(value: str) -> str:
    return _SAFE_SLUG_RE.sub("_", value).strip("._-") or "model"


def _download_image(url: str, dest: Path) -> Path:
    """Fetch ``url`` to ``dest`` (creating parents). Returns ``dest``.

    Picsum (used by the no-credentials stub) returns 302 → image; httpx
    follows redirects when ``follow_redirects=True``.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def _run_one(
    *,
    model_id: str,
    model_label: str,
    prompt: str,
    label_base: str,
    out_dir: Path,
    reference_image_paths: list[Path] | None,
) -> dict:
    """Generate one image for one ``model_id``. Never raises.

    Returns a result dict with keys: ``model_id``, ``model_label``,
    ``ok``, ``elapsed_s``, ``image_path`` (relative to ``out_dir``) or
    ``error`` on failure, plus the underlying ``meta`` dict from
    ``call_scenario`` when successful.
    """
    slug = _safe_slug(model_id)
    model_dir = out_dir / slug
    image_path = model_dir / "hero.png"

    t0 = time.perf_counter()
    try:
        url, meta = call_scenario(
            prompt,
            label=f"{label_base}__{slug}",
            model_id=model_id,
            reference_image_paths=reference_image_paths,
        )
    except Exception as e:  # noqa: BLE001
        elapsed = time.perf_counter() - t0
        log.warning("Scenario compare failed for model_id=%s: %s", model_id, e)
        return {
            "model_id": model_id,
            "model_label": model_label,
            "ok": False,
            "elapsed_s": elapsed,
            "error": f"{type(e).__name__}: {e}",
            "image_path": None,
            "meta": None,
        }

    try:
        _download_image(url, image_path)
    except Exception as e:  # noqa: BLE001
        elapsed = time.perf_counter() - t0
        log.warning(
            "Scenario compare: download failed for model_id=%s url=%s: %s",
            model_id,
            url,
            e,
        )
        return {
            "model_id": model_id,
            "model_label": model_label,
            "ok": False,
            "elapsed_s": elapsed,
            "error": f"download_failed: {e}",
            "image_path": None,
            "meta": meta,
        }

    elapsed = time.perf_counter() - t0
    return {
        "model_id": model_id,
        "model_label": model_label,
        "ok": True,
        "elapsed_s": elapsed,
        "image_path": str(image_path.relative_to(out_dir)),
        "stub": bool(meta.get("stub")),
        "url": url,
        "mode": meta.get("mode"),
        "meta": meta,
    }


def _render_grid_html(
    *,
    out_dir: Path,
    brief: CreativeBrief,
    prompt: str,
    results: list[dict],
) -> Path:
    """Write a no-build static HTML page with a CSS-grid of all variants."""
    cards: list[str] = []
    for r in results:
        slug = _safe_slug(r["model_id"])
        if r["ok"] and r["image_path"]:
            img_html = (
                f'<img src="{r["image_path"]}" alt="{slug}" '
                f'loading="lazy" />'
            )
            badge = (
                "stub" if r.get("stub") else f'{r["elapsed_s"]:.1f}s'
            )
        else:
            img_html = (
                '<div class="missing">no image<br/><small>'
                f'{(r.get("error") or "").replace("<", "&lt;")}</small></div>'
            )
            badge = "FAIL"

        cards.append(
            f"""
        <figure class="card">
          <div class="frame">{img_html}</div>
          <figcaption>
            <strong>{r["model_label"]}</strong>
            <code>{r["model_id"]}</code>
            <span class="badge">{badge}</span>
          </figcaption>
        </figure>"""
        )

    prompt_html = prompt.replace("<", "&lt;").replace(">", "&gt;")
    title = (brief.title or "Scenario model comparison").replace(
        "<", "&lt;"
    )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>HookLens · Scenario model compare · {title}</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{
    margin: 0; padding: 24px;
    font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
    background: #0d0d10; color: #e8e8ee;
  }}
  h1 {{ font-size: 18px; margin: 0 0 4px; }}
  h2 {{ font-size: 13px; font-weight: 500; opacity: .7; margin: 0 0 16px; }}
  .prompt {{
    background: #16161c; border: 1px solid #2a2a32; border-radius: 8px;
    padding: 12px 14px; font-size: 12px; line-height: 1.45;
    white-space: pre-wrap; max-height: 160px; overflow: auto;
    margin-bottom: 24px;
  }}
  .grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }}
  .card {{
    background: #16161c; border: 1px solid #2a2a32; border-radius: 10px;
    padding: 10px; margin: 0; display: flex; flex-direction: column;
  }}
  .frame {{
    aspect-ratio: 9 / 16; width: 100%; background: #0a0a0d;
    border-radius: 6px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }}
  .frame img {{ width: 100%; height: 100%; object-fit: cover; }}
  .missing {{ color: #ff6b6b; font-size: 12px; text-align: center; padding: 12px; }}
  figcaption {{
    margin-top: 8px; display: flex; flex-direction: column; gap: 2px;
    font-size: 12px;
  }}
  figcaption code {{
    font-size: 11px; opacity: .65;
  }}
  .badge {{
    align-self: flex-start; margin-top: 4px;
    background: #23232c; padding: 2px 6px; border-radius: 4px;
    font-size: 10px; letter-spacing: .03em;
  }}
</style>
</head>
<body>
  <h1>{title}</h1>
  <h2>Scenario model comparison · brief id <code>{brief.archetype_id}</code> · target <code>{brief.target_game_id}</code></h2>
  <div class="prompt">{prompt_html}</div>
  <div class="grid">{"".join(cards)}
  </div>
</body>
</html>
"""
    grid_path = out_dir / "grid.html"
    grid_path.write_text(html)
    return grid_path


def compare_models_for_brief(
    brief: CreativeBrief,
    *,
    model_ids: list[tuple[str, str]],
    reference_image_paths: list[Path] | None = None,
    out_dir: Path,
) -> dict[str, list[Path]]:
    """Generate ``brief``'s hero shot through every ``model_id`` in parallel.

    Reuses ``call_scenario`` from :mod:`app.creative.scenario` (and therefore
    its on-disk cache, keyed by prompt + model + mode + refs). Subsequent
    runs with the same inputs hit the cache and are essentially free.

    On per-model failure, the slot's value is an empty list and execution
    continues — one bad ``model_id`` does not abort the whole comparison.

    Side effects (under ``out_dir``):
      - ``<safe_model_id>/hero.png`` for each model that succeeded
      - ``summary.json`` listing prompt + per-model status, paths, timings
      - ``grid.html`` static viewer (open it in a browser)

    Returns ``{model_id: [Path, ...]}``. Caller should treat an empty list
    as "this model errored — see ``summary.json`` for the reason".
    """
    if not brief.scenario_prompts:
        raise ValueError(
            f"Brief {brief.archetype_id!r} has no scenario_prompts to compare."
        )

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    hero_prompt = brief.scenario_prompts[0]
    label_base = f"compare_{_safe_slug(brief.target_game_id)}_{_safe_slug(brief.archetype_id)}"

    results: list[dict] = []
    max_workers = max(1, len(model_ids))
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {
            ex.submit(
                _run_one,
                model_id=mid,
                model_label=mlabel,
                prompt=hero_prompt,
                label_base=label_base,
                out_dir=out_dir,
                reference_image_paths=reference_image_paths,
            ): mid
            for mid, mlabel in model_ids
        }
        for fut in as_completed(futures):
            results.append(fut.result())

    order = {mid: i for i, (mid, _) in enumerate(model_ids)}
    results.sort(key=lambda r: order.get(r["model_id"], 999))

    grid_path = _render_grid_html(
        out_dir=out_dir, brief=brief, prompt=hero_prompt, results=results
    )

    summary = {
        "brief": {
            "archetype_id": brief.archetype_id,
            "target_game_id": brief.target_game_id,
            "title": brief.title,
        },
        "hero_prompt": hero_prompt,
        "reference_image_paths": [
            str(p) for p in (reference_image_paths or [])
        ],
        "models": [
            {
                "model_id": r["model_id"],
                "model_label": r["model_label"],
                "ok": r["ok"],
                "elapsed_s": round(r["elapsed_s"], 2),
                "image_path": r.get("image_path"),
                "stub": r.get("stub", False),
                "mode": r.get("mode"),
                "url": r.get("url"),
                "error": r.get("error"),
            }
            for r in results
        ],
        "grid_html": str(grid_path.relative_to(out_dir)),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    return {
        r["model_id"]: (
            [out_dir / r["image_path"]]
            if r["ok"] and r["image_path"]
            else []
        )
        for r in results
    }
