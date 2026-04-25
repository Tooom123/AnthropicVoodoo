import { useState } from 'react'
import MetricInput from './MetricInput.jsx'
import GenreSelect from './GenreSelect.jsx'
import FileUpload from './FileUpload.jsx'
import { DEMO_PROTO_PUBLISH, DEMO_PROTO_KILL } from '../../lib/mockData.js'
import { BENCHMARKS } from '../../lib/benchmarks.js'

const DEFAULTS = {
  name: '',
  genre: 'auto',
  coreLoop: '',
  screenshots: [],
  hasKpiData: false,
  retentionD1: 35,
  retentionD7: 12,
  cpi: 0.4,
  sessionsPerDay: 4.0,
  sessionDuration: 5.0,
  testDays: 7,
  platform: 'both',
}

export default function PrototypeForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULTS)

  function set(field) {
    return value => setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(form)
  }

  const hasContent = form.screenshots.length > 0 || form.coreLoop.trim().length > 0
  const bm = form.hasKpiData && form.genre !== 'auto' ? BENCHMARKS[form.genre] : null

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div
        className="bg-white border border-gray-200 rounded-2xl p-6"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs text-gray-400 font-sans">Load a sample dataset:</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...DEMO_PROTO_PUBLISH, screenshots: [], hasKpiData: true })}
              className="px-3 py-1 rounded-lg text-xs font-mono font-medium border transition-colors"
              style={{ backgroundColor: '#f0fdf4', borderColor: '#10b981', color: '#059669' }}
            >
              PUBLISH case
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...DEMO_PROTO_KILL, screenshots: [], hasKpiData: true })}
              className="px-3 py-1 rounded-lg text-xs font-mono font-medium border transition-colors"
              style={{ backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#dc2626' }}
            >
              KILL case
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 font-sans">Prototype Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name')(e.target.value)}
                placeholder="e.g. Marble Crush 3D"
                required
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              />
            </div>
            <GenreSelect value={form.genre} onChange={set('genre')} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 font-sans">
              Screenshots
              <span className="ml-2 text-xs font-normal text-indigo-400 font-mono">
                Claude analyzes genre, UX clarity, core loop, visual complexity
              </span>
            </label>
            <FileUpload files={form.screenshots} onChange={set('screenshots')} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 font-sans">
              Core Loop Description
              <span className="ml-2 text-xs font-normal text-gray-400 font-sans">
                {form.screenshots.length > 0 ? 'Optional — complements screenshot analysis' : 'Required if no screenshots'}
              </span>
            </label>
            <textarea
              value={form.coreLoop}
              onChange={e => set('coreLoop')(e.target.value)}
              placeholder="What does the player do repeatedly? What is the reward loop? What creates the urge to continue?"
              required={form.screenshots.length === 0}
              rows={4}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => set('hasKpiData')(!form.hasKpiData)}
              className="flex items-center gap-2 text-sm font-sans text-gray-600 hover:text-indigo-600 transition-colors"
            >
              <div
                className="w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ backgroundColor: form.hasKpiData ? '#4f46e5' : '#e5e7eb' }}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full bg-white shadow-sm mt-0.5 transition-transform"
                  style={{ transform: form.hasKpiData ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </div>
              <span className="font-medium">
                {form.hasKpiData ? 'A/B test KPIs included' : 'I have A/B test results to add'}
              </span>
              {!form.hasKpiData && (
                <span className="text-xs text-gray-400">
                  — leave off for pre-launch analysis only
                </span>
              )}
            </button>

            {form.hasKpiData && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-5">
                  <MetricInput
                    label="Retention D1"
                    tooltip="% of players who return on day 1 after install"
                    value={form.retentionD1}
                    onChange={set('retentionD1')}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    showSlider
                    benchmark={bm ? `≥${bm.retentionD1.good}%` : null}
                  />
                  <MetricInput
                    label="Retention D7"
                    tooltip="% of players who return on day 7 after install"
                    value={form.retentionD7}
                    onChange={set('retentionD7')}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    showSlider
                    benchmark={bm ? `≥${bm.retentionD7.good}%` : null}
                  />
                  <MetricInput
                    label="CPI"
                    tooltip="Cost per install in USD — lower is better"
                    value={form.cpi}
                    onChange={set('cpi')}
                    min={0.01}
                    max={10}
                    step={0.01}
                    unit="$"
                    benchmark={bm ? `≤$${bm.cpi.good}` : null}
                  />
                </div>
                <div className="space-y-5">
                  <MetricInput
                    label="Sessions / Day"
                    tooltip="Average sessions per active player per day"
                    value={form.sessionsPerDay}
                    onChange={set('sessionsPerDay')}
                    min={0.1}
                    max={20}
                    step={0.1}
                    unit="/ day"
                    benchmark={bm ? `≥${bm.sessionsPerDay.good}` : null}
                  />
                  <MetricInput
                    label="Session Duration"
                    tooltip="Average session length in minutes"
                    value={form.sessionDuration}
                    onChange={set('sessionDuration')}
                    min={0.5}
                    max={60}
                    step={0.5}
                    unit="min"
                    benchmark={bm ? `≥${bm.sessionDuration.good} min` : null}
                  />
                  <MetricInput
                    label="Test Duration"
                    tooltip="How many days the test ran"
                    value={form.testDays}
                    onChange={set('testDays')}
                    min={1}
                    max={30}
                    step={1}
                    unit="days"
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 font-sans">Platform</label>
                    <select
                      value={form.platform}
                      onChange={e => set('platform')(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                    >
                      <option value="ios">iOS</option>
                      <option value="android">Android</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !hasContent}
        className="w-full py-4 rounded-2xl text-white font-sans font-semibold text-base transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#4f46e5', boxShadow: '0 4px 14px rgba(79,70,229,0.3)' }}
      >
        {loading ? 'Analyzing...' : 'Analyze Prototype'}
      </button>
    </form>
  )
}
