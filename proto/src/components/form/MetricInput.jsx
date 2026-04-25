import { useState } from 'react'

export default function MetricInput({
  label,
  tooltip,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  showSlider = false,
  benchmark = null,
}) {
  const [showTip, setShowTip] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-700 font-sans">{label}</label>
          {tooltip && (
            <div className="relative">
              <button
                type="button"
                className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 text-xs flex items-center justify-center hover:bg-gray-200 transition-colors"
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
              >
                ?
              </button>
              {showTip && (
                <div className="absolute left-6 top-0 z-10 w-48 bg-white border border-gray-200 rounded-lg p-2 text-xs text-gray-600 font-sans shadow-md">
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        {benchmark && (
          <span className="text-xs font-mono text-indigo-400">
            good: {benchmark}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showSlider && (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            className="flex-1"
          />
        )}
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
          />
          {unit && (
            <span className="text-xs text-gray-400 font-mono w-8">{unit}</span>
          )}
        </div>
      </div>
    </div>
  )
}
