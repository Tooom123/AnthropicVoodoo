# CLAUDE.md — Prototype Ranker
> Context file for Claude Code. Read this before touching any file.

---

## 🎯 Project Overview

**Prototype Ranker** is a web tool built for the **VoodooHack 2026** hackathon (Track 3 — AI for Business Intelligence), co-organized by Voodoo, Anthropic, and Unaite.

**The problem it solves:** Voodoo tests ~2,000 game prototypes per year and must decide for each one: **Publish / Iterate / Kill**. This decision currently requires manual analysis by experienced game managers. Prototype Ranker automates and standardizes this process using Claude AI.

**What it does:** A game manager inputs a prototype's KPIs and a description of its core loop. The tool returns a structured AI analysis: a score out of 100, a verdict, dimension-by-dimension breakdown, strengths, risks, and concrete recommendations — in seconds.

---

## 🏗️ Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React (Vite) | Fast setup, component-based |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| Charts | Recharts | Colorful, composable, React-native |
| AI | Anthropic API (`claude-sonnet-4-20250514`) | Provided by hackathon |
| Routing | React Router | Simple page transitions |
| State | useState / useReducer | No need for external store |
| Deploy | Vercel | One-command deploy |

---

## 🎨 Design System

### Visual Identity: **Dot Grid UI**

The entire interface uses a **dot grid background** — white background with a subtle regular grid of small grey dots. This creates a clean, technical, notebook-like aesthetic that feels modern and precise. Think Figma canvas meets Notion.

```css
/* Dot grid background — apply to root/body */
background-color: #ffffff;
background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px);
background-size: 24px 24px;
```

### Color Palette

```css
:root {
  /* Base */
  --bg: #ffffff;
  --dot: #d1d5db;
  --surface: #ffffff;
  --border: #e5e7eb;
  --text-primary: #111827;
  --text-secondary: #6b7280;

  /* Accent — electric indigo, used sparingly */
  --accent: #4f46e5;
  --accent-light: #eef2ff;

  /* Chart colors — vivid, contrasted, never muted */
  --chart-retention: #6366f1;    /* indigo */
  --chart-monetization: #f59e0b; /* amber */
  --chart-coreloop: #10b981;     /* emerald */
  --chart-marketfit: #ef4444;    /* red */
  --chart-score: #8b5cf6;        /* violet */

  /* Verdicts */
  --publish: #10b981;   /* green */
  --iterate: #f59e0b;   /* amber */
  --kill: #ef4444;      /* red */
}
```

### Typography

```css
/* Display / headings */
font-family: 'DM Serif Display', serif;

/* Body / UI */
font-family: 'DM Mono', monospace;  /* for scores, numbers, tags */
font-family: 'DM Sans', sans-serif; /* for body text, labels */
```

Import from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet">
```

### Cards & Surfaces

- White cards with `border: 1px solid var(--border)` and `border-radius: 12px`
- Subtle shadow: `box-shadow: 0 1px 4px rgba(0,0,0,0.06)`
- **No dark backgrounds** — the dot grid must always be visible behind everything
- Generous padding: `24px` minimum inside cards

### Charts — The Visual Centerpiece

Charts must be **vivid and colorful** — they are the main output of the tool. Use Recharts with:
- Fully saturated colors (see `--chart-*` variables above)
- Rounded bar corners (`radius={[6, 6, 0, 0]}`)
- Custom tooltips with white background and colored border
- Animated on mount (`isAnimationActive={true}`)
- No grey — use color even for grid lines (very light, `#f3f4f6`)

The main score should be displayed as a large `RadialBarChart` or `PieChart` — colorful, prominent, centered.

---

## 📁 Project Structure

```
prototype-ranker/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx                  # Entry point
│   ├── App.jsx                   # Router setup
│   ├── index.css                 # Global styles + dot grid background
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Badge.jsx         # Verdict badge (PUBLISH/ITERATE/KILL)
│   │   │   ├── ScoreRing.jsx     # Circular score display (big, colorful)
│   │   │   ├── DimensionBar.jsx  # Horizontal progress bar per dimension
│   │   │   └── LoadingState.jsx  # Animated loading with fun messages
│   │   │
│   │   ├── form/
│   │   │   ├── PrototypeForm.jsx # Main input form
│   │   │   ├── MetricInput.jsx   # Reusable metric field with tooltip
│   │   │   └── GenreSelect.jsx   # Game genre dropdown
│   │   │
│   │   ├── results/
│   │   │   ├── ResultsDashboard.jsx  # Main results layout
│   │   │   ├── VerdictHeader.jsx     # Big verdict + score at top
│   │   │   ├── DimensionsChart.jsx   # Radar or bar chart of 4 dimensions
│   │   │   ├── BenchmarkChart.jsx    # Compare prototype vs industry avg
│   │   │   ├── StrengthsRisks.jsx    # Two-column strengths/risks
│   │   │   └── Recommendations.jsx  # Ordered action list
│   │   │
│   │   └── history/
│   │       ├── HistoryPanel.jsx  # Sidebar list of past analyses
│   │       └── HistoryCard.jsx   # Mini card per prototype
│   │
│   ├── hooks/
│   │   ├── useAnalysis.js        # Claude API call logic
│   │   └── useHistory.js         # LocalStorage persistence
│   │
│   ├── lib/
│   │   ├── anthropic.js          # API wrapper for Claude
│   │   ├── benchmarks.js         # Industry benchmarks by genre
│   │   ├── prompts.js            # Claude prompt templates
│   │   └── utils.js              # Score color, verdict label, etc.
│   │
│   └── pages/
│       ├── Home.jsx              # Landing / form page
│       └── Results.jsx           # Results page after analysis
│
├── CLAUDE.md                     # This file
├── README.md
├── package.json
└── vite.config.js
```

---

## 🔌 Claude API Integration

### Setup (`src/lib/anthropic.js`)

```javascript
// API key is injected at runtime — never hardcode
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

export const analyzePrototype = async (protoData) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        { role: "user", content: buildPrompt(protoData) }
      ]
    })
  });

  const data = await response.json();
  const text = data.content[0].text;

  // Strip markdown fences if present
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};
```

### Environment Variables

```bash
# .env.local
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

---

## 📊 Data Model
























































### Input — PrototypeData

Two analysis modes are supported:

**Pre-launch** (screenshots + optional description, no KPIs): Claude uses computer vision and NLP to assess genre, visual complexity, UX clarity, core loop clarity, and similarity with existing titles. No A/B test required.

**Post-test** (screenshots + KPIs): Full analysis with benchmark comparison per genre.

```typescript
{
  // Identity
  name: string,
  genre: "auto" | "hyper_casual" | "hybrid_casual" | "puzzle" | "arcade" | "simulation",
  // "auto" = Claude detects from screenshots

  // Visual inputs (pre-launch, primary analysis signal)
  screenshots: FileData[],    // { name, type, dataUrl } — up to 4 images
  coreLoop: string,           // optional description if no screenshots

  // A/B test KPIs (post-test, optional)
  hasKpiData: boolean,
  retentionD1?: number,       // 0-100 (percentage)
  retentionD7?: number,       // 0-100 (percentage)
  cpi?: number,               // USD, lower is better
  sessionsPerDay?: number,
  sessionDuration?: number,   // minutes
  testDays?: number,
  platform?: "ios" | "android" | "both",
}
```

### Output — AnalysisResult

```typescript
{
  score: number,              // 0-100
  verdict: "PUBLISH" | "ITERATE" | "KILL",
  confidence: "HIGH" | "MEDIUM" | "LOW",

  // Only present when screenshots were provided
  visual_analysis?: {
    detected_genre: string,
    visual_complexity: "LOW" | "MEDIUM" | "HIGH",
    ux_clarity: number,              // 0-100
    core_loop_clarity: "CLEAR" | "MODERATE" | "UNCLEAR",
    art_style: string,
    onboarding_readability: string,
  },

  dimensions: {
    retention:           { score: number, comment: string },
    monetization:        { score: number, comment: string },
    core_loop_quality:   { score: number, comment: string },
    market_fit:          { score: number, comment: string }
  },

  strengths: string[],        // 2-4 bullet points
  risks: string[],            // 2-4 bullet points
  recommendations: string[],  // 3-5 ordered action items
  comparable_hits: string[],  // ["Marble Sort", "Ball Sort 3D"]
  executive_summary: string   // 2-3 sentences max, for a CEO
}
```

---

## 📐 Industry Benchmarks (`src/lib/benchmarks.js`)

Used to contextualize the prototype's KPIs. Source: public reports from AppsFlyer, GameAnalytics, Sensor Tower (2024-2025).

```javascript
export const BENCHMARKS = {
  hyper_casual: {
    retentionD1: { poor: 25, average: 35, good: 45 },
    retentionD7: { poor: 8,  average: 15, good: 22 },
    cpi:         { poor: 0.8, average: 0.4, good: 0.15 },  // lower = better
    sessionsPerDay:   { poor: 2, average: 4, good: 7 },
    sessionDuration:  { poor: 2, average: 4, good: 7 }
  },
  hybrid_casual: {
    retentionD1: { poor: 30, average: 40, good: 50 },
    retentionD7: { poor: 12, average: 20, good: 30 },
    cpi:         { poor: 1.5, average: 0.8, good: 0.35 },
    sessionsPerDay:   { poor: 3, average: 6, good: 10 },
    sessionDuration:  { poor: 5, average: 10, good: 18 }
  },
  puzzle: {
    retentionD1: { poor: 28, average: 38, good: 48 },
    retentionD7: { poor: 10, average: 18, good: 26 },
    cpi:         { poor: 1.2, average: 0.6, good: 0.25 },
    sessionsPerDay:   { poor: 2, average: 5, good: 8 },
    sessionDuration:  { poor: 4, average: 8, good: 15 }
  }
  // add: arcade, simulation
}
```

---

## 💬 Claude Prompt (`src/lib/prompts.js`)

```javascript
export const buildPrompt = (proto, benchmarks) => `
You are a senior publishing analyst at Voodoo, the world's top mobile game publisher.
You have analyzed thousands of prototypes. Your job is to evaluate whether this prototype
should be Published, Iterated, or Killed.

Be direct, data-driven, and actionable. Avoid generic advice.

## Prototype Data
- Name: ${proto.name}
- Genre: ${proto.genre}
- Core Loop: ${proto.coreLoop}
- Retention D1: ${proto.retentionD1}%
- Retention D7: ${proto.retentionD7}%
- CPI: $${proto.cpi}
- Sessions/day: ${proto.sessionsPerDay}
- Session duration: ${proto.sessionDuration} min
- Test duration: ${proto.testDays} days

## Genre Benchmarks
${JSON.stringify(benchmarks, null, 2)}

## Instructions
Return ONLY a valid JSON object. No markdown, no explanation outside the JSON.

{
  "score": <integer 0-100>,
  "verdict": <"PUBLISH" | "ITERATE" | "KILL">,
  "confidence": <"HIGH" | "MEDIUM" | "LOW">,
  "dimensions": {
    "retention":         { "score": <0-100>, "comment": "<one sentence>" },
    "monetization":      { "score": <0-100>, "comment": "<one sentence>" },
    "core_loop_quality": { "score": <0-100>, "comment": "<one sentence>" },
    "market_fit":        { "score": <0-100>, "comment": "<one sentence>" }
  },
  "strengths": ["<point>", "<point>"],
  "risks": ["<point>", "<point>"],
  "recommendations": ["<action>", "<action>", "<action>"],
  "comparable_hits": ["<game name>", "<game name>"],
  "executive_summary": "<2-3 sentences max>"
}
`;
```

---

## 🖥️ Key UI Screens

### Screen 1 — Home / Form
- Top: logo + tagline (*"Ship the right games. Kill the rest."*)
- Center: the prototype input form, two columns
  - Left: quantitative KPIs (sliders + number inputs)
  - Right: genre select + core loop text area
- Bottom: CTA button *"Analyze Prototype"* — full width, accent color
- Background: dot grid, always visible

### Screen 2 — Loading
- Full screen, dot grid background
- Animated spinner or pulsing score ring
- Rotating messages:
  - *"Comparing with 847 historical prototypes..."*
  - *"Checking D7 against genre benchmarks..."*
  - *"Consulting the Voodoo publishing playbook..."*
  - *"Generating verdict..."*

### Screen 3 — Results Dashboard
Layout (desktop, two columns):

```
┌──────────────────────────────────────────────────────┐
│  🎮 Marble Crush 3D          [ITERATE] confidence: HIGH │
│  Score: 73/100  ████████████████░░░░                  │
├──────────────────────┬───────────────────────────────┤
│  Dimensions (radar   │  vs. Benchmark (bar chart)    │
│  or bar chart)       │  prototype vs genre avg       │
├──────────────────────┴───────────────────────────────┤
│  ✅ Strengths          ⚠️ Risks                       │
│  • ...                 • ...                          │
├───────────────────────────────────────────────────────┤
│  🎯 Recommendations (numbered, ordered by impact)     │
│  1. ...   2. ...   3. ...                             │
├───────────────────────────────────────────────────────┤
│  🎮 Similar hits: Marble Sort · Ball Sort 3D          │
├───────────────────────────────────────────────────────┤
│  📋 Executive Summary (italic, grey, 2-3 sentences)   │
└───────────────────────────────────────────────────────┘
```

Right sidebar (or bottom panel): history of past analyses in the session.

---

## ⚡ Development Priorities

Build in this order:

1. **Claude API call works** → hardcode a fake form, get a real JSON back
2. **Results dashboard renders** → display the JSON beautifully
3. **Form is functional** → wire inputs to the API call
4. **Loading state** → add messages and animation
5. **History** → persist to localStorage, show sidebar
6. **Polish** → animations, responsiveness, edge cases

---

## 🚫 What NOT to do

- No authentication, no backend — everything runs in the browser
- No dark mode — dot grid is a white-background concept
- No generic chart colors (no grey bars, no default blue/orange Recharts palette)
- No Lorem Ipsum in the final demo — use realistic Voodoo-style prototype names
- No `alert()` for errors — use inline error states in the UI
- Never expose the API key in git — always use `.env.local`

---

## 🎬 Demo Script (for Sunday pitch)

1. Open the app — show the clean dot grid form
2. Fill in a prototype that should **PUBLISH** (high D1/D7, low CPI) — e.g. inspired by "Marble Sort"
3. Show the vivid results dashboard, talk through the score
4. Fill in a **KILL** case (poor metrics) — contrast is dramatic
5. Show the history panel with both analyses side-by-side
6. Close with the executive summary: *"This is what a Voodoo publishing analyst sees in 5 seconds instead of 2 hours"*

---

## 📦 Quick Start

```bash
npm create vite@latest prototype-ranker -- --template react
cd prototype-ranker
npm install tailwindcss recharts react-router-dom
npx tailwindcss init -p
cp .env.example .env.local
# Add your VITE_ANTHROPIC_API_KEY
npm run dev
```

---

*Built at VoodooHack 2026 · Paris · April 25-26*
*Track 3 — AI for Business Intelligence*
