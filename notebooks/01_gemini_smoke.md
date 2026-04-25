# Notebook 01 — Gemini Pro video deconstruction smoke test

**Goal**: validate that Gemini 2.5 Pro can analyze a 9:16 ad video and return a parseable `DeconstructedCreative`.

**Success criteria**:

- < 30s per video (p50)
- > 80% parse rate on 5 test videos
- Cost per video estimate documented

**Steps**:

1. Pick 5 short (≤15s) 9:16 ad videos. If Partner 1's SensorTower client isn't ready, hardcode 5 public mobile game ad URLs (e.g. from YouTube unlisted shorts or any direct mp4).
2. Use Google Gen AI SDK with `response_schema=DeconstructedCreative`:
  ```python
   from google import genai
   from google.genai import types
   from app.models import DeconstructedCreative, RawCreative

   client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

   response = client.models.generate_content(
       model="gemini-2.5-pro",
       contents=[
           types.Part.from_uri(file_uri=video_url, mime_type="video/mp4"),
           "Deconstruct this mobile game ad. Identify the hook (first 3s), "
           "scene flow, on-screen text, voiceover transcript, CTA, dominant "
           "colors, and visual style. Output strictly matching the schema.",
       ],
       config=types.GenerateContentConfig(
           response_mime_type="application/json",
           response_schema=DeconstructedCreative,
       ),
   )
   parsed = DeconstructedCreative.model_validate_json(response.text)
  ```
3. Measure latency with `time.perf_counter()` for each call.
4. Decision tree:
  - **Green** (< 30s, > 80% parse): proceed with full pipeline on videos
  - **Yellow** (30-60s OR 60-80% parse): tune prompt, reduce schema strictness
  - **Red** (> 60s OR < 60% parse): fallback to thumb_url + ad copy text path

**Convert to .ipynb**:

```bash
uv run jupytext --to notebook notebooks/01_gemini_smoke.md
```

Or just create `01_gemini_smoke.ipynb` from scratch following these steps.