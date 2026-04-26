import { useLocation, useNavigate } from 'react-router-dom'
import Badge from '../components/ui/Badge.jsx'
import ScoreRing from '../components/ui/ScoreRing.jsx'
import { scoreColor, genreLabel } from '../lib/utils.js'

const DIMENSION_LABELS = {
  retention: 'Retention',
  monetization: 'Monetization',
  core_loop_quality: 'Core Loop',
  market_fit: 'Market Fit',
}

const DIMENSION_COLORS = {
  retention: '#6366f1',
  monetization: '#f59e0b',
  core_loop_quality: '#10b981',
  market_fit: '#ef4444',
}

function Delta({ a, b }) {
  const diff = b - a
  if (diff === 0) return <span className="text-xs font-mono text-gray-300">—</span>
  const color = diff > 0 ? '#10b981' : '#ef4444'
  return (
    <span className="text-xs font-mono font-bold" style={{ color }}>
      {diff > 0 ? '+' : ''}{diff}
    </span>
  )
}

function SideCard({ entry, label }) {
  const { proto, result } = entry
  const color = scoreColor(result.score)

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center text-center gap-3"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <p className="text-xs font-mono text-gray-400">{label}</p>
      <ScoreRing score={result.score} size={100} />
      <div>
        <h2 className="text-lg font-serif text-gray-900">{proto.name}</h2>
        <p className="text-xs text-gray-400 font-sans mt-0.5">{genreLabel(proto.genre)}</p>
      </div>
      <Badge verdict={result.verdict} size="md" />
    </div>
  )
}

export default function Compare() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state

  if (!state?.a || !state?.b) {
    navigate('/')
    return null
  }

  const { a, b } = state
  const scoreDiff = b.result.score - a.result.score
  const winner = scoreDiff > 0 ? 'b' : scoreDiff < 0 ? 'a' : null

  const dimensionKeys = Object.keys(a.result.dimensions)

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-400 hover:text-gray-600 font-sans transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-xs font-mono text-gray-300">Comparison</span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SideCard entry={a} label="A" />
            <SideCard entry={b} label="B" />
          </div>

          {winner && (
            <div
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <p className="text-sm font-sans text-gray-500">
                <span className="font-semibold text-gray-800">
                  {winner === 'b' ? b.proto.name : a.proto.name}
                </span>
                {' '}scores{' '}
                <span className="font-mono font-bold" style={{ color: '#10b981' }}>
                  {Math.abs(scoreDiff)} points
                </span>
                {' '}higher
              </p>
            </div>
          )}

          <div
            className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div className="px-6 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 font-sans">Dimensions</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs font-mono text-gray-400">
                  <th className="px-6 py-2 text-left font-normal">Dimension</th>
                  <th className="px-4 py-2 text-center font-normal">A</th>
                  <th className="px-4 py-2 text-center font-normal">B</th>
                  <th className="px-4 py-2 text-center font-normal">Delta</th>
                </tr>
              </thead>
              <tbody>
                {dimensionKeys.map(key => {
                  const scoreA = a.result.dimensions[key]?.score ?? 0
                  const scoreB = b.result.dimensions[key]?.score ?? 0
                  const color = DIMENSION_COLORS[key]
                  return (
                    <tr key={key} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-sm font-sans text-gray-700">
                            {DIMENSION_LABELS[key]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold" style={{ color: scoreColor(scoreA) }}>
                          {scoreA}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold" style={{ color: scoreColor(scoreB) }}>
                          {scoreB}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Delta a={scoreA} b={scoreB} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { entry: a, label: 'A — Recommendations' },
              { entry: b, label: 'B — Recommendations' },
            ].map(({ entry, label }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-2xl p-5"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <h3 className="text-xs font-semibold text-gray-400 font-mono mb-3">{label}</h3>
                <ol className="space-y-2">
                  {entry.result.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-600 font-sans leading-relaxed">
                      <span
                        className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center font-mono text-xs font-bold"
                      >
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{rec}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
