import { useState, useEffect } from 'react'

const STORAGE_KEY = 'prototype-ranker-history'

export function useHistory() {
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  }, [history])

  function addEntry(proto, result) {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      proto,
      result,
    }
    setHistory(prev => [entry, ...prev].slice(0, 20))
  }

  function clearHistory() {
    setHistory([])
  }

  return { history, addEntry, clearHistory }
}
