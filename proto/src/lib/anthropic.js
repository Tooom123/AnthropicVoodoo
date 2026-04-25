import { buildPrompt } from './prompts.js'
import { MOCK_RESULTS } from './mockData.js'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

function isDemoMode() {
  return !ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'sk-ant-...'
}

function pickMockResult(protoData) {
  if (!protoData.hasKpiData) return MOCK_RESULTS.publish
  const score =
    protoData.retentionD1 * 0.35 +
    protoData.retentionD7 * 0.35 +
    (1 / protoData.cpi) * 5 +
    protoData.sessionsPerDay * 2
  return score > 30 ? MOCK_RESULTS.publish : MOCK_RESULTS.kill
}

function buildContent(protoData) {
  const textBlock = { type: 'text', text: buildPrompt(protoData) }

  if (!protoData.screenshots?.length) {
    return [textBlock]
  }

  const imageBlocks = protoData.screenshots.map(f => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: f.type,
      data: f.dataUrl.split(',')[1],
    },
  }))

  return [...imageBlocks, textBlock]
}

export async function analyzePrototype(protoData) {
  if (isDemoMode()) {
    await new Promise(r => setTimeout(r, 3800))
    return pickMockResult(protoData)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildContent(protoData) }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()
  const text = data.content[0].text
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}
