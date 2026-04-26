import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { BENCHMARKS } from '../../lib/benchmarks.js'
import { genreLabel } from '../../lib/utils.js'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-md">
      <p className="font-mono text-xs text-gray-400 mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-mono text-xs" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function BenchmarkChart({ proto }) {
  const benchmarks = BENCHMARKS[proto.genre]
  if (!benchmarks) return null

  const data = [
    {
      name: 'D1 Ret. %',
      Prototype: proto.retentionD1,
      Average: benchmarks.retentionD1.average,
      Good: benchmarks.retentionD1.good,
    },
    {
      name: 'D7 Ret. %',
      Prototype: proto.retentionD7,
      Average: benchmarks.retentionD7.average,
      Good: benchmarks.retentionD7.good,
    },
    {
      name: 'Sessions/d',
      Prototype: proto.sessionsPerDay,
      Average: benchmarks.sessionsPerDay.average,
      Good: benchmarks.sessionsPerDay.good,
    },
    {
      name: 'Sess. min',
      Prototype: proto.sessionDuration,
      Average: benchmarks.sessionDuration.average,
      Good: benchmarks.sessionDuration.good,
    },
  ]

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <h3 className="text-sm font-semibold text-gray-700 font-sans mb-1">
        vs. {genreLabel(proto.genre)} benchmarks
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barSize={14} barGap={2} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fontFamily: 'DM Sans' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: 'DM Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'DM Sans', paddingTop: 8 }} />
          <Bar dataKey="Prototype" fill="#4f46e5" radius={[4, 4, 0, 0]} isAnimationActive />
          <Bar dataKey="Average" fill="#d1d5db" radius={[4, 4, 0, 0]} isAnimationActive />
          <Bar dataKey="Good" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
