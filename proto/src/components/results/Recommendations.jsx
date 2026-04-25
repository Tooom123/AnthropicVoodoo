export default function Recommendations({ recommendations, comparableHits }) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <h3 className="text-sm font-semibold text-gray-700 font-sans mb-4">Recommendations</h3>
      <ol className="space-y-3">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex gap-3 text-sm text-gray-700 font-sans leading-relaxed">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono text-xs font-bold">
              {i + 1}
            </span>
            <span className="pt-0.5">{rec}</span>
          </li>
        ))}
      </ol>

      {comparableHits?.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-sans mb-2">Similar titles</p>
          <div className="flex flex-wrap gap-2">
            {comparableHits.map((hit, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs font-mono text-gray-600"
              >
                {hit}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
