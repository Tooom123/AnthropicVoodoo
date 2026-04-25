export const BENCHMARKS = {
  hyper_casual: {
    retentionD1: { poor: 25, average: 35, good: 45 },
    retentionD7: { poor: 8, average: 15, good: 22 },
    cpi: { poor: 0.8, average: 0.4, good: 0.15 },
    sessionsPerDay: { poor: 2, average: 4, good: 7 },
    sessionDuration: { poor: 2, average: 4, good: 7 },
  },
  hybrid_casual: {
    retentionD1: { poor: 30, average: 40, good: 50 },
    retentionD7: { poor: 12, average: 20, good: 30 },
    cpi: { poor: 1.5, average: 0.8, good: 0.35 },
    sessionsPerDay: { poor: 3, average: 6, good: 10 },
    sessionDuration: { poor: 5, average: 10, good: 18 },
  },
  puzzle: {
    retentionD1: { poor: 28, average: 38, good: 48 },
    retentionD7: { poor: 10, average: 18, good: 26 },
    cpi: { poor: 1.2, average: 0.6, good: 0.25 },
    sessionsPerDay: { poor: 2, average: 5, good: 8 },
    sessionDuration: { poor: 4, average: 8, good: 15 },
  },
  arcade: {
    retentionD1: { poor: 26, average: 36, good: 46 },
    retentionD7: { poor: 9, average: 16, good: 24 },
    cpi: { poor: 1.0, average: 0.5, good: 0.2 },
    sessionsPerDay: { poor: 3, average: 5, good: 8 },
    sessionDuration: { poor: 3, average: 6, good: 10 },
  },
  simulation: {
    retentionD1: { poor: 32, average: 42, good: 52 },
    retentionD7: { poor: 14, average: 22, good: 32 },
    cpi: { poor: 2.0, average: 1.0, good: 0.4 },
    sessionsPerDay: { poor: 2, average: 4, good: 7 },
    sessionDuration: { poor: 8, average: 15, good: 25 },
  },
}
