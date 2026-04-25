import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const COLORS = {
  retention: '#6366f1',
  monetization: '#f59e0b',
  core_loop_quality: '#10b981',
  market_fit: '#ef4444',
}

const LABELS = {
  retention: 'Retention',
  monetization: 'Monetization',
  core_loop_quality: 'Core Loop',
  market_fit: 'Market Fit',
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const color = payload[0].payload.fill
  return (
    <div className="bg-white border rounded-xl p-3 shadow-md" style={{ borderColor: color }}>
      <p className="font-mono text-xs text-gray-400 mb-1">{label}</p>
      <p className="font-mono font-bold text-sm" style={{ color }}>
        {payload[0].value}/100
      </p>
    </div>
  )
}

export default function DimensionsChart({ dimensions }) {
  const data = Object.entries(dimensions).map(([key, val]) => ({
    name: LABELS[key] || key,
    score: val.score,
    fill: COLORS[key] || '#6366f1',
    comment: val.comment,
    key,
  }))

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <h3 className="text-sm font-semibold text-gray-700 font-sans mb-4">Dimension Scores</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={44} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fontFamily: 'DM Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <Bar dataKey="score" radius={[6, 6, 0, 0]} isAnimationActive>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 space-y-2.5">
        {data.map(d => (
          <div key={d.key} className="flex gap-2 text-xs font-sans">
            <span
              className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
              style={{ backgroundColor: d.fill }}
            />
            <span>
              <span className="font-medium text-gray-700">{d.name}:</span>{' '}
              <span className="text-gray-500">{d.comment}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
