import Badge from '../ui/Badge.jsx'
import { formatTime, genreLabel, scoreColor } from '../../lib/utils.js'

export default function HistoryCard({ entry, onClick, compareMode = false, isSelected = false }) {
  const { proto, result, timestamp } = entry
  const color = scoreColor(result.score)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl p-3 transition-colors"
      style={{
        border: isSelected
          ? '2px solid #4f46e5'
          : compareMode
          ? '2px solid #e5e7eb'
          : '1px solid #e5e7eb',
        boxShadow: isSelected
          ? '0 0 0 3px rgba(79,70,229,0.12)'
          : '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 font-sans truncate">{proto.name}</p>
          <p className="text-xs text-gray-400 font-sans">{genreLabel(proto.genre)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {compareMode && (
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center mb-0.5"
              style={{
                borderColor: isSelected ? '#4f46e5' : '#d1d5db',
                backgroundColor: isSelected ? '#4f46e5' : 'transparent',
              }}
            >
              {isSelected && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          )}
          <span className="font-mono text-sm font-bold" style={{ color }}>
            {result.score}
          </span>
          <Badge verdict={result.verdict} size="sm" />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-gray-300 font-mono">{formatTime(timestamp)}</p>
    </button>
  )
}
