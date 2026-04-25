export const MOCK_RESULTS = {
  publish: {
    score: 81,
    verdict: 'PUBLISH',
    confidence: 'HIGH',
    visual_analysis: {
      detected_genre: 'Hyper Casual — Sort Puzzle',
      visual_complexity: 'LOW',
      ux_clarity: 91,
      core_loop_clarity: 'CLEAR',
      art_style: 'Flat 3D, pastel palette, high contrast UI',
      onboarding_readability: 'The action is immediately obvious from the first frame — no tutorial needed.',
    },
    dimensions: {
      retention: {
        score: 88,
        comment: 'D1 of 42% and D7 of 19% both clear genre averages by a significant margin.',
      },
      monetization: {
        score: 74,
        comment: 'CPI of $0.22 is well below the good threshold, leaving strong margin for UA scaling.',
      },
      core_loop_quality: {
        score: 82,
        comment: 'The sort mechanic creates a satisfying loop with clear short-term goals and visible progress.',
      },
      market_fit: {
        score: 79,
        comment: 'Color sort puzzle is a proven category with sustained top-chart presence in 2024-2025.',
      },
    },
    strengths: [
      'Retention curve beats genre benchmarks at both D1 and D7, indicating strong intrinsic engagement.',
      'CPI of $0.22 is exceptional for hyper-casual — leaves room for profitable UA at scale.',
      'Core loop is simple to onboard but has enough visual clarity to drive repeat sessions.',
    ],
    risks: [
      'D7 at 19% suggests a mid-funnel drop that needs investigation before scaling.',
      'Category saturation is high — differentiation through meta-layer or visual identity is critical.',
    ],
    recommendations: [
      'Run an A/B test on level difficulty curve at levels 8-15 to address mid-funnel churn.',
      'Add a streak reward mechanic to drive daily return habit and push D7 above 22%.',
      'Greenlight a UA burst test at $5k to validate CPI holds at volume before full scaling.',
      'Commission 3 visual theme variants (pastel, neon, minimal) to A/B against the current art style.',
    ],
    comparable_hits: ['Ball Sort Puzzle', 'Color Water Sort', 'Sort It 3D'],
    executive_summary:
      'Marble Sort 3D shows the retention and CPI profile of a publishable hyper-casual title. The core loop is solid and the unit economics work at scale. One targeted difficulty-curve test is recommended before committing to full UA spend.',
  },
  kill: {
    score: 28,
    verdict: 'KILL',
    confidence: 'HIGH',
    visual_analysis: {
      detected_genre: 'Hyper Casual — Merge / Idle',
      visual_complexity: 'HIGH',
      ux_clarity: 34,
      core_loop_clarity: 'UNCLEAR',
      art_style: 'Cluttered grid UI, inconsistent icon sizes, no clear focal point',
      onboarding_readability: 'The first screen has 12 interactive elements with no visual hierarchy guiding the player.',
    },
    dimensions: {
      retention: {
        score: 22,
        comment: 'D1 of 18% and D7 of 4% are both well below poor thresholds for this genre.',
      },
      monetization: {
        score: 31,
        comment: 'CPI of $1.80 makes profitable UA mathematically impossible at current retention.',
      },
      core_loop_quality: {
        score: 29,
        comment: 'The tap-to-merge mechanic lacks a clear reward signal and does not create urgency to continue.',
      },
      market_fit: {
        score: 30,
        comment: 'Merge category has seen declining top-chart presence since Q3 2024 without a strong differentiator.',
      },
    },
    strengths: [
      'Session duration of 7 min suggests players who engage are moderately invested.',
    ],
    risks: [
      'D1 at 18% is below the poor threshold — the first session experience is failing to hook players.',
      'CPI combined with weak retention means every install loses money.',
      'No clear differentiator from existing merge games already in top 100.',
    ],
    recommendations: [
      'Do not invest further in UA on this build.',
      'Conduct 5 user interviews to identify the exact point of first-session abandonment.',
      'If the IP has potential, consider a complete core loop redesign before re-testing.',
    ],
    comparable_hits: ['Merge Mansion', 'Merge Dragons'],
    executive_summary:
      'Merge Idle 2048 does not meet minimum publishability thresholds on any key metric. Retention is critically low, CPI is unworkable, and the category trend is unfavorable. Recommended action is to kill this prototype and reallocate the team.',
  },
}

export const DEMO_PROTO_PUBLISH = {
  name: 'Marble Sort 3D',
  genre: 'hyper_casual',
  coreLoop:
    'The player is presented with a set of tubes containing colored marbles. They must sort each tube so that it contains only one color, by tapping a tube to pick up the top marble and tapping another tube to drop it. A tube can only receive a marble if it is empty or if the top marble matches the incoming color. Completing all tubes advances to the next level, with increasing tube count and color variety.',
  retentionD1: 42,
  retentionD7: 19,
  cpi: 0.22,
  sessionsPerDay: 5.2,
  sessionDuration: 6.0,
  testDays: 10,
  platform: 'both',
}

export const DEMO_PROTO_KILL = {
  name: 'Merge Idle 2048',
  genre: 'hyper_casual',
  coreLoop:
    'Players tap to spawn numbered tiles on a grid and drag matching tiles together to merge them into higher values. Idle income accumulates over time, letting players return to spend resources on permanent multipliers. The loop repeats until the board fills up, at which point a prestige resets progress for a permanent boost.',
  retentionD1: 18,
  retentionD7: 4,
  cpi: 1.8,
  sessionsPerDay: 2.1,
  sessionDuration: 7.0,
  testDays: 7,
  platform: 'android',
}
