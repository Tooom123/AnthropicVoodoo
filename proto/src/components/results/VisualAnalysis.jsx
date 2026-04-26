const COMPLEXITY_COLORS = {
  LOW: { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669' },
  MEDIUM: { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
  HIGH: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
}

const CLARITY_COLORS = {
  CLEAR: { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669' },
  MODERATE: { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
  UNCLEAR: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
}

function Chip({ label, value, colors }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400 font-sans">{label}</p>
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-medium border"
        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
      >
        {value}
      </span>
    </div>
  )
}

export default function VisualAnalysis({ analysis, screenshots }) {
  if (!analysis) return null

  const complexityStyle = COMPLEXITY_COLORS[analysis.visual_complexity] || COMPLEXITY_COLORS.MEDIUM
  const clarityStyle = CLARITY_COLORS[analysis.core_loop_clarity] || CLARITY_COLORS.MODERATE

  return (
    <div
      className="bg-white border border-indigo-100 rounded-2xl p-6"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 font-sans">Visual Analysis</h3>
        <span className="text-xs font-mono text-indigo-400 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
          from screenshots
        </span>
      </div>

      {screenshots?.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {screenshots.map((f, i) => (
            <img
              key={i}
              src={f.dataUrl}
              alt={`Screenshot ${i + 1}`}
              className="h-16 w-auto rounded-lg border border-gray-200 flex-shrink-0 object-cover"
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Chip
          label="Detected genre"
          value={analysis.detected_genre}
          colors={{ bg: '#eef2ff', border: '#c7d2fe', text: '#4f46e5' }}
        />
        <Chip
          label="Visual complexity"
          value={analysis.visual_complexity}
          colors={complexityStyle}
        />
        <Chip
          label="Core loop clarity"
          value={analysis.core_loop_clarity}
          colors={clarityStyle}
        />
        <div className="space-y-1">
          <p className="text-xs text-gray-400 font-sans">UX clarity</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${analysis.ux_clarity}%`, backgroundColor: '#4f46e5' }}
              />
            </div>
            <span className="text-xs font-mono text-indigo-500 font-medium">
              {analysis.ux_clarity}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {analysis.art_style && (
          <div className="flex gap-2 text-xs font-sans text-gray-500">
            <span className="text-gray-300 font-mono">Art style</span>
            <span>{analysis.art_style}</span>
          </div>
        )}
        {analysis.onboarding_readability && (
          <div className="flex gap-2 text-xs font-sans text-gray-500">
            <span className="text-gray-300 font-mono">Onboarding</span>
            <span>{analysis.onboarding_readability}</span>
          </div>
        )}
      </div>
    </div>
  )
}
