export function verdictColor(verdict) {
  if (verdict === 'PUBLISH') return '#10b981'
  if (verdict === 'ITERATE') return '#f59e0b'
  return '#ef4444'
}

export function scoreColor(score) {
  if (score >= 70) return '#10b981'
  if (score >= 45) return '#f59e0b'
  return '#ef4444'
}

export function confidenceLabel(confidence) {
  const labels = {
    HIGH: 'High confidence',
    MEDIUM: 'Medium confidence',
    LOW: 'Low confidence',
  }
  return labels[confidence] || confidence
}

export function genreLabel(genre) {
  const labels = {
    hyper_casual: 'Hyper Casual',
    hybrid_casual: 'Hybrid Casual',
    puzzle: 'Puzzle',
    arcade: 'Arcade',
    simulation: 'Simulation',
  }
  return labels[genre] || genre
}

export function formatTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
