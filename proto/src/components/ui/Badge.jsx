import { verdictColor } from '../../lib/utils.js'

const sizes = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-1.5',
}

export default function Badge({ verdict, size = 'md' }) {
  const color = verdictColor(verdict)
  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded-full ${sizes[size]}`}
      style={{ backgroundColor: color + '1a', color, border: `1px solid ${color}` }}
    >
      {verdict}
    </span>
  )
}
