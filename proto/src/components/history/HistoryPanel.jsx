import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HistoryCard from './HistoryCard.jsx'

export default function HistoryPanel({ history, onSelect, onClear }) {
  const navigate = useNavigate()
  const [compareMode, setCompareMode] = useState(false)
  const [compareSet, setCompareSet] = useState([])

  if (history.length === 0) return null

  function toggleCompare(entry) {
    setCompareSet(prev => {
      if (prev.find(e => e.id === entry.id)) return prev.filter(e => e.id !== entry.id)
      if (prev.length >= 2) return [prev[1], entry]
      return [...prev, entry]
    })
  }

  function goCompare() {
    navigate('/compare', { state: { a: compareSet[0], b: compareSet[1] } })
    setCompareMode(false)
    setCompareSet([])
  }

  function exitCompareMode() {
    setCompareMode(false)
    setCompareSet([])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider font-mono">
            History
          </h3>
          <button
            onClick={() => navigate('/portfolio')}
            className="text-xs text-indigo-400 hover:text-indigo-600 font-mono transition-colors"
          >
            portfolio
          </button>
        </div>
        <div className="flex items-center gap-2">
          {history.length >= 2 && (
            <button
              onClick={() => (compareMode ? exitCompareMode() : setCompareMode(true))}
              className="text-xs font-sans transition-colors"
              style={{ color: compareMode ? '#4f46e5' : '#9ca3af' }}
            >
              {compareMode ? 'cancel' : 'compare'}
            </button>
          )}
          {!compareMode && (
            <button
              onClick={onClear}
              className="text-xs text-gray-300 hover:text-gray-500 font-sans transition-colors"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {compareMode && (
        <div className="px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100">
          <p className="text-xs text-indigo-500 font-sans">
            {compareSet.length === 0 && 'Select 2 analyses to compare'}
            {compareSet.length === 1 && 'Select one more'}
            {compareSet.length === 2 && (
              <button
                onClick={goCompare}
                className="font-semibold underline"
              >
                Compare selected &rarr;
              </button>
            )}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {history.map(entry => (
          <HistoryCard
            key={entry.id}
            entry={entry}
            onClick={() => (compareMode ? toggleCompare(entry) : onSelect(entry))}
            compareMode={compareMode}
            isSelected={compareSet.some(e => e.id === entry.id)}
          />
        ))}
      </div>
    </div>
  )
}
