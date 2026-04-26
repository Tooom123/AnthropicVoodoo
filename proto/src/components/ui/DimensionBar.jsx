const DIMENSION_COLORS = {
  retention: '#6366f1',
  monetization: '#f59e0b',
  core_loop_quality: '#10b981',
  market_fit: '#ef4444',
}

const DIMENSION_LABELS = {
  retention: 'Retention',
  monetization: 'Monetization',
  core_loop_quality: 'Core Loop',
  market_fit: 'Market Fit',
}

export default function DimensionBar({ dimension, score, comment }) {
  const color = DIMENSION_COLORS[dimension] || '#6366f1'
  const label = DIMENSION_LABELS[dimension] || dimension

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 font-sans">{label}</span>
        <span className="font-mono text-sm font-medium" style={{ color }}>{score}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      {comment && (
        <p className="text-xs text-gray-500 font-sans leading-relaxed">{comment}</p>
      )}
    </div>
  )
}
