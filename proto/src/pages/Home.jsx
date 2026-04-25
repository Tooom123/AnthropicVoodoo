import { useNavigate } from 'react-router-dom'
import PrototypeForm from '../components/form/PrototypeForm.jsx'
import LoadingState from '../components/ui/LoadingState.jsx'
import HistoryPanel from '../components/history/HistoryPanel.jsx'
import { useAnalysis } from '../hooks/useAnalysis.js'
import { useHistory } from '../hooks/useHistory.js'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const IS_DEMO = !API_KEY || API_KEY === 'sk-ant-...'

export default function Home() {
  const navigate = useNavigate()
  const { analyze, loading, error } = useAnalysis()
  const { history, addEntry, clearHistory } = useHistory()

  async function handleSubmit(formData) {
    const result = await analyze(formData)
    if (result) {
      addEntry(formData, result)
      navigate('/results', { state: { proto: formData, result } })
    }
  }

  function handleSelectHistory(entry) {
    navigate('/results', { state: { proto: entry.proto, result: entry.result } })
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif text-gray-900 mb-2">Prototype Ranker</h1>
          <p className="text-base text-gray-400 font-sans">
            Ship the right games. Kill the rest.
          </p>
          {IS_DEMO && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-mono text-amber-600">Demo mode — using mock data</span>
            </div>
          )}
        </div>

        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div
                className="bg-white border border-gray-200 rounded-2xl"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <LoadingState />
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-sans">
                    {error}
                  </div>
                )}
                <PrototypeForm onSubmit={handleSubmit} loading={loading} />
              </>
            )}
          </div>

          {history.length > 0 && (
            <div className="w-56 flex-shrink-0 pt-1">
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
