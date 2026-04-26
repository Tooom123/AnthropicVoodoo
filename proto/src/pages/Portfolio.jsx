import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistory } from '../hooks/useHistory.js'
import Badge from '../components/ui/Badge.jsx'
import { scoreColor, genreLabel, formatTime } from '../lib/utils.js'

const VERDICTS = ['PUBLISH', 'ITERATE', 'KILL']
const GENRES = ['hyper_casual', 'hybrid_casual', 'puzzle', 'arcade', 'simulation']

function Sparkline({ scores }) {
  if (scores.length < 2) return null
  const W = 56
  const H = 22
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1
  const pts = scores.map((s, i) => [
    (i / (scores.length - 1)) * W,
    H - ((s - min) / range) * (H - 4) - 2,
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const trend = scores[scores.length - 1] - scores[0]
  const color = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#9ca3af'

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  )
}

function ScoreBar({ score }) {
  const color = scoreColor(score)
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function GroupRow({ entries, onSelect }) {
  const [expanded, setExpanded] = useState(false)
  const latest = entries[entries.length - 1]
  const isIteration = entries.length > 1
  const scores = entries.map(e => e.result.score)
  const trend = isIteration ? scores[scores.length - 1] - scores[0] : 0

  return (
    <>
      <tr
        className="border-t border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => isIteration ? setExpanded(v => !v) : onSelect(latest)}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {isIteration && (
              <span className="text-gray-300 font-mono text-xs w-3 text-center">
                {expanded ? 'v' : '>'}
              </span>
            )}
            <div>
              <p className="text-sm font-medium text-gray-800 font-sans">{latest.proto.name}</p>
              {isIteration && (
                <p className="text-xs text-indigo-400 font-mono">{entries.length} runs</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-500 font-sans">{genreLabel(latest.proto.genre)}</span>
        </td>
        <td className="px-4 py-3">
          <Badge verdict={latest.result.verdict} size="sm" />
        </td>
        <td className="px-4 py-3">
          <ScoreBar score={latest.result.score} />
        </td>
        <td className="px-4 py-3">
          {isIteration ? (
            <div className="flex items-center gap-2">
              <Sparkline scores={scores} />
              <span
                className="text-xs font-mono font-bold"
                style={{ color: trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#9ca3af' }}
              >
                {trend > 0 ? '+' : ''}{trend}
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-300 font-mono">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-300 font-mono">
          {formatTime(latest.timestamp)}
        </td>
      </tr>
      {expanded && isIteration && entries.map((entry, i) => (
        <tr
          key={entry.id}
          className="border-t border-gray-50 bg-gray-50 hover:bg-indigo-50 cursor-pointer transition-colors"
          onClick={() => onSelect(entry)}
        >
          <td className="px-5 py-2 pl-12">
            <span className="text-xs font-mono text-gray-400">run {i + 1}</span>
          </td>
          <td className="px-4 py-2">
            <span className="text-xs text-gray-400 font-sans">{genreLabel(entry.proto.genre)}</span>
          </td>
          <td className="px-4 py-2">
            <Badge verdict={entry.result.verdict} size="sm" />
          </td>
          <td className="px-4 py-2">
            <ScoreBar score={entry.result.score} />
          </td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2 text-xs text-gray-300 font-mono">
            {formatTime(entry.timestamp)}
          </td>
        </tr>
      ))}
    </>
  )
}

export default function Portfolio() {
  const navigate = useNavigate()
  const { history, clearHistory } = useHistory()
  const [verdictFilter, setVerdictFilter] = useState(null)
  const [genreFilter, setGenreFilter] = useState(null)
  const [sortBy, setSortBy] = useState('date')

  const filtered = useMemo(() => {
    return history.filter(e => {
      if (verdictFilter && e.result.verdict !== verdictFilter) return false
      if (genreFilter && e.proto.genre !== genreFilter) return false
      return true
    })
  }, [history, verdictFilter, genreFilter])

  const groups = useMemo(() => {
    const map = {}
    for (const entry of filtered) {
      const key = entry.proto.name.trim().toLowerCase()
      if (!map[key]) map[key] = []
      map[key].push(entry)
    }
    const grouped = Object.values(map).map(entries =>
      [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    )
    if (sortBy === 'score') {
      return grouped.sort((a, b) => b[b.length - 1].result.score - a[a.length - 1].result.score)
    }
    return grouped.sort((a, b) => new Date(b[b.length - 1].timestamp) - new Date(a[a.length - 1].timestamp))
  }, [filtered, sortBy])

  function handleSelect(entry) {
    navigate('/results', { state: { proto: entry.proto, result: entry.result } })
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-gray-600 font-sans transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-xs font-mono text-gray-300">Prototype Ranker</span>
        </div>

        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-gray-900">Portfolio</h1>
            <p className="text-sm text-gray-400 font-sans mt-1">
              {history.length} {history.length === 1 ? 'analysis' : 'analyses'}
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-gray-300 hover:text-red-400 font-sans transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div
            className="bg-white border border-gray-200 rounded-2xl p-16 text-center"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <p className="text-gray-400 font-sans text-sm">No analyses yet.</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 text-sm text-indigo-500 font-sans hover:underline"
            >
              Analyze your first prototype
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-center gap-3"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <div className="flex items-center gap-1.5">
                {[null, ...VERDICTS].map(v => (
                  <button
                    key={v ?? 'all'}
                    onClick={() => setVerdictFilter(v)}
                    className="px-3 py-1 rounded-lg text-xs font-mono transition-colors"
                    style={{
                      backgroundColor: verdictFilter === v ? '#4f46e5' : '#f9fafb',
                      color: verdictFilter === v ? 'white' : '#6b7280',
                      border: '1px solid',
                      borderColor: verdictFilter === v ? '#4f46e5' : '#e5e7eb',
                    }}
                  >
                    {v ?? 'All'}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-gray-200" />

              <select
                value={genreFilter ?? ''}
                onChange={e => setGenreFilter(e.target.value || null)}
                className="text-xs font-sans border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All genres</option>
                {GENRES.map(g => (
                  <option key={g} value={g}>{genreLabel(g)}</option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-gray-400 font-sans">Sort:</span>
                {['date', 'score'].map(s => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className="px-2 py-1 rounded-lg text-xs font-mono transition-colors"
                    style={{
                      backgroundColor: sortBy === s ? '#eef2ff' : 'transparent',
                      color: sortBy === s ? '#4f46e5' : '#9ca3af',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-mono text-gray-400 bg-gray-50">
                    <th className="px-5 py-3 text-left font-normal">Prototype</th>
                    <th className="px-4 py-3 text-left font-normal">Genre</th>
                    <th className="px-4 py-3 text-left font-normal">Verdict</th>
                    <th className="px-4 py-3 text-left font-normal">Score</th>
                    <th className="px-4 py-3 text-left font-normal">Trend</th>
                    <th className="px-4 py-3 text-left font-normal">Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group, i) => (
                    <GroupRow key={i} entries={group} onSelect={handleSelect} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
