import Badge from '../ui/Badge.jsx'
import ScoreRing from '../ui/ScoreRing.jsx'
import { confidenceLabel } from '../../lib/utils.js'

export default function VerdictHeader({ proto, result }) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6 flex items-start gap-6"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <ScoreRing score={result.score} size={120} />
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-serif text-gray-900 leading-tight">{proto.name}</h1>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <Badge verdict={result.verdict} size="lg" />
          <span className="text-sm text-gray-400 font-mono">{confidenceLabel(result.confidence)}</span>
        </div>
        <p className="mt-4 text-sm text-gray-500 font-sans leading-relaxed italic">
          {result.executive_summary}
        </p>
      </div>
    </div>
  )
}
