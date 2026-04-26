import { useState, useEffect } from 'react'

const MESSAGES = [
  'Comparing with 847 historical prototypes...',
  'Checking D7 against genre benchmarks...',
  'Consulting the Voodoo publishing playbook...',
  'Analyzing core loop mechanics...',
  'Evaluating market fit signals...',
  'Generating verdict...',
]

export default function LoadingState() {
  const [msgIndex, setMsgIndex] = useState(0)
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % MESSAGES.length)
    }, 2200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => (d.length >= 3 ? '.' : d + '.'))
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-8">
      <div className="relative">
        <div
          className="w-20 h-20 rounded-full border-4 border-gray-100 animate-spin"
          style={{ borderTopColor: '#4f46e5' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-indigo-50" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="font-mono text-sm text-gray-500">{MESSAGES[msgIndex]}</p>
        <p className="font-mono text-xs text-gray-300">{dots}</p>
      </div>
    </div>
  )
}
