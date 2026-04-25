export default function StrengthsRisks({ strengths, risks }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        className="bg-white border border-emerald-100 rounded-2xl p-6"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        <h3 className="text-sm font-semibold text-emerald-700 font-sans mb-3">Strengths</h3>
        <ul className="space-y-2.5">
          {strengths.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700 font-sans leading-relaxed">
              <span className="text-emerald-500 flex-shrink-0 font-bold mt-0.5">+</span>
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="bg-white border border-red-100 rounded-2xl p-6"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        <h3 className="text-sm font-semibold text-red-600 font-sans mb-3">Risks</h3>
        <ul className="space-y-2.5">
          {risks.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700 font-sans leading-relaxed">
              <span className="text-red-400 flex-shrink-0 font-bold mt-0.5">!</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
