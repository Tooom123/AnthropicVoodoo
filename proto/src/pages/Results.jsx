import { useLocation, useNavigate } from 'react-router-dom'
import ResultsDashboard from '../components/results/ResultsDashboard.jsx'
import HistoryPanel from '../components/history/HistoryPanel.jsx'
import { useHistory } from '../hooks/useHistory.js'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const { history, clearHistory } = useHistory()

  const state = location.state
  if (!state?.proto || !state?.result) {
    navigate('/')
    return null
  }

  const { proto, result } = state

  function handleSelectHistory(entry) {
    navigate('/results', { state: { proto: entry.proto, result: entry.result } })
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-gray-600 font-sans transition-colors"
          >
            &larr; New Analysis
          </button>
          <span className="text-xs font-mono text-gray-300">Prototype Ranker</span>
        </div>

        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0">
            <ResultsDashboard proto={proto} result={result} />
          </div>

          {history.length > 0 && (
            <div className="w-56 flex-shrink-0">
              <HistoryPanel
                history={history}
                onSelect={handleSelectHistory}
                onClear={clearHistory}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
