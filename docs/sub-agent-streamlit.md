# Sub-agent prompt — Streamlit UI workstream

Copy-paste this into a fresh Claude Code session (Sonnet 4.6, max thinking) **on the `edouard-ui` branch**. Run it in parallel while Edouard works on Gemini deconstruction.

---

## Prompt

```
You're the UI workstream for HookLens (Voodoo Hack 2026, Track 3).
Build a Streamlit app skeleton on top of stub data.

CONTEXT TO READ FIRST (in this order):
1. README.md — high-level project layout
2. docs/hooklens-spec.md — product spec, golden path, signal definitions
3. app/models.py — data contract, your single source of truth

YOUR TASK:
Create streamlit_app.py and app/ui/* with the following sections, all driven
by a stub HookLensReport loaded from app/cache/sample_report.json.

LAYOUT:

1. Header
   - Page title "HookLens — Market-Driven Creative Pipeline"
   - Text input "Game name" + "Analyze" button
   - Pipeline progress placeholder (8 stages, with check marks)
   - On click "Analyze" with sample data: simulate progress (asyncio.sleep
     between stages) then render the stub report

2. "Game DNA" card
   - 3 palette swatches (rendered from ColorPalette hex values)
   - Mechanics rendered as colored chips
   - Audience proxy as italic subtitle
   - Core loop in a quote block
   - Visual style + UI mood as tags

3. "Market Archetypes" section
   - Table of top 5 CreativeArchetype rows
   - Per row: label | velocity_score (progress bar 0-5) | derivative_spread
     (progress bar 0-1) | freshness_days (number with color coding:
     green if <14, yellow 14-60, red >60) | overall_signal_score (big number)
   - Click row to expand: rationale text + thumbnails of member creatives
     (load from raw.thumb_url with PIL fallback to picsum.photos)

4. "Top 3 Creatives" section
   - For each GeneratedVariant, 2-column layout:
     LEFT: hero_frame image (use st.image, fallback to picsum.photos/640/360)
     RIGHT:
       - brief.title in big bold
       - brief.hook_3s in a callout box
       - brief.scene_flow as numbered list
       - brief.cta highlighted in a colored badge
       - "Test priority: #{n}" with rationale
       - Expander "Full brief & rationale" → all CreativeBrief fields
       - Two buttons: "Download Brief (PDF)" and "Download Brief (JSON)"

5. Footer
   - pipeline_duration_seconds + total_cost_usd
   - "Generated at: {generated_at}"

ALSO CREATE:
- app/cache/sample_report.json: a realistic dummy HookLensReport for
  "Marble Sort" (Voodoo). Include 5 archetypes with believable labels
  (e.g. "ASMR satisfying sort", "Fail rage-bait", "UGC celebrity reaction",
  "Tutorial mistake", "Transformation reveal") and 3 GeneratedVariants.
  Use https://picsum.photos/seed/{n}/640/360 for hero_frame_path entries.
  Use believable hex palettes that match a casual puzzle game.

- app/ui/cards.py with reusable components:
  render_palette_swatch(palette: ColorPalette)
  render_archetype_row(archetype: CreativeArchetype)
  render_variant_card(variant: GeneratedVariant)

- app/ui/pdf.py: brief_to_pdf(brief: CreativeBrief) -> bytes (use weasyprint)

CONSTRAINTS:
- DO NOT touch app/analysis/, app/sources/, app/creative/ — owned by other devs
- Use uv for deps: uv add streamlit streamlit-extras pillow weasyprint
- NEVER mutate app/models.py
- Test locally with `streamlit run streamlit_app.py` before declaring done
- Commit to branch `edouard-ui` with message:
  "feat(ui): streamlit skeleton with stub HookLensReport"

QUALITY BAR:
- Polished spacing, no debug print statements
- Loading states for the simulated pipeline run
- Empty state if sample_report.json is missing (with clear error)
- Mobile-friendly column collapse
- Color palette derived from Voodoo's brand (purple/dark, can use a custom theme)

Stop and ask before making any architectural decision not covered above.
```

---

## What you should expect back

A runnable Streamlit app showing the full HookLens flow on stub data. When
the real pipeline lands, you swap `sample_report.json` with the real output
and the UI just works.

## When to merge

- After the sub-agent finishes, you review the diff on `edouard-ui`
- You merge into `edouard` once it renders cleanly with stub data
- Real pipeline integration happens by replacing the JSON load with a real
  call to your `analysis.run_pipeline(game_name) -> HookLensReport` function
