import { useEffect, useState } from 'react'
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'
import { scoreColor } from '../../lib/utils.js'

export default function ScoreRing({ score, size = 160 }) {
  const [displayed, setDisplayed] = useState(0)
  const color = scoreColor(score)

  useEffect(() => {
    setDisplayed(0)
    const duration = 1200
    const startTime = performance.now()

    let raf
    function tick(now) {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(ease * score))
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])

  const data = [{ value: score, fill: color }]

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="65%"
          outerRadius="85%"
          startAngle={220}
          endAngle={-40}
          data={data}
          barSize={12}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={8}
            background={{ fill: '#f3f4f6' }}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold" style={{ fontSize: size * 0.2, color }}>
          {displayed}
        </span>
        <span className="font-mono text-gray-400" style={{ fontSize: size * 0.1 }}>
          /100
        </span>
      </div>
    </div>
  )
}
