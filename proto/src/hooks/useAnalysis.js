import { useState } from 'react'
import { analyzePrototype } from '../lib/anthropic.js'

export function useAnalysis() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function analyze(protoData) {
    setLoading(true)
    setError(null)
    try {
      const result = await analyzePrototype(protoData)
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { analyze, loading, error }
}
