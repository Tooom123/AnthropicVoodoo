import { BENCHMARKS } from './benchmarks.js'

export function buildPrompt(proto) {
  const hasScreenshots = proto.screenshots?.length > 0
  const hasKpis = proto.hasKpiData
  const benchmarks = hasKpis && proto.genre !== 'auto' ? BENCHMARKS[proto.genre] : null

  return `You are a senior publishing analyst at Voodoo, the world's top mobile game publisher.
You have analyzed thousands of mobile game prototypes. Your role is to evaluate whether this prototype should be Published, Iterated, or Killed.
${hasScreenshots ? `\nYou are provided with ${proto.screenshots.length} screenshot(s) of the prototype. Study them carefully before reading the rest.` : ''}

## Prototype
- Name: ${proto.name}
- Genre: ${proto.genre === 'auto' ? 'Unknown — infer from screenshots and description' : proto.genre}
${proto.coreLoop ? `- Core Loop: ${proto.coreLoop}` : ''}

${hasKpis ? `## A/B Test Results
- Retention D1: ${proto.retentionD1}%
- Retention D7: ${proto.retentionD7}%
- CPI: $${proto.cpi}
- Sessions/day: ${proto.sessionsPerDay}
- Session duration: ${proto.sessionDuration} min
- Test duration: ${proto.testDays} days
- Platform: ${proto.platform}
` : `## Note
No A/B test data is available yet — this is a pre-launch evaluation.
Base your assessment on visual design, UX clarity, and core loop analysis${hasScreenshots ? ' from the provided screenshots' : ''}.
Focus on design signals, not retention numbers.
`}
${benchmarks ? `## Genre Benchmarks
${JSON.stringify(benchmarks, null, 2)}
` : ''}
## Your Tasks
${hasScreenshots ? `
Visual & Design Analysis (from screenshots):
  - Detect the actual game genre
  - Assess visual complexity: LOW, MEDIUM, or HIGH
  - Rate UX clarity and onboarding readability (0-100)
  - Judge if the core loop is CLEAR, MODERATE, or UNCLEAR from the UI alone
  - Identify the art style in one short phrase
  - Identify similar published titles
` : ''}
Scoring: Evaluate across Retention potential, Monetization potential, Core Loop Quality, Market Fit.
Verdict: PUBLISH, ITERATE, or KILL. Be direct and data-driven.

## Instructions
Return ONLY a valid JSON object — no markdown fences, no text outside the JSON.

{
  "score": <integer 0-100>,
  "verdict": <"PUBLISH" | "ITERATE" | "KILL">,
  "confidence": <"HIGH" | "MEDIUM" | "LOW">,
${hasScreenshots ? `  "visual_analysis": {
    "detected_genre": "<genre name>",
    "visual_complexity": <"LOW" | "MEDIUM" | "HIGH">,
    "ux_clarity": <integer 0-100>,
    "core_loop_clarity": <"CLEAR" | "MODERATE" | "UNCLEAR">,
    "art_style": "<brief phrase>",
    "onboarding_readability": "<one sentence assessment>"
  },` : ''}
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
}`
}
