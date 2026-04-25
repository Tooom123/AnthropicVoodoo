const GENRES = [
  { value: 'auto', label: 'Auto-detect from screenshots' },
  { value: 'hyper_casual', label: 'Hyper Casual' },
  { value: 'hybrid_casual', label: 'Hybrid Casual' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'arcade', label: 'Arcade' },
  { value: 'simulation', label: 'Simulation' },
]

export default function GenreSelect({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700 font-sans">Genre</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-sans bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        {GENRES.map(g => (
          <option key={g.value} value={g.value}>{g.label}</option>
        ))}
      </select>
    </div>
  )
}
