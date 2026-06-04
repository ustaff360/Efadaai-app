import React, { useState, useEffect, useCallback } from 'react'

const API = 'http://192.168.1.20:8000'

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTime(isoStr) {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return isoStr }
}

export default function CallHistory() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [agentOptions, setAgentOptions] = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])
  const [selectedCall, setSelectedCall] = useState(null)

  const loadCalls = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (agentFilter) params.set('agent_id', agentFilter)
      if (categoryFilter) params.set('category_id', categoryFilter)
      if (dateFrom) params.set('from_date', dateFrom)
      if (dateTo) params.set('to_date', dateTo)
      params.set('page', page)
      params.set('limit', 50)

      const res = await fetch(`${API}/api/v1/reports/call_history?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCalls(data.calls || [])
      }
    } catch (err) {
      console.error('Failed to load call history:', err)
    } finally {
      setLoading(false)
    }
  }, [searchTerm, agentFilter, categoryFilter, dateFrom, dateTo, page])

  const loadOptions = useCallback(async () => {
    try {
      const [agentsRes, catsRes] = await Promise.all([
        fetch(`${API}/api/v1/agents/`),
        fetch(`${API}/api/v1/categories/`),
      ])
      if (agentsRes.ok) setAgentOptions((await agentsRes.json()) || [])
      if (catsRes.ok) setCategoryOptions((await catsRes.json()) || [])
    } catch (err) {
      console.error('Failed to load options:', err)
    }
  }, [])

  useEffect(() => {
    loadOptions()
    loadCalls()
  }, [loadOptions, loadCalls])

  const agentsByExtension = {}
  agentOptions.forEach(a => { agentsByExtension[a.extension] = a })

  const categoriesById = {}
  categoryOptions.forEach(c => { categoriesById[c.id] = c })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-dark">Call History</h1>
          <p className="text-sm text-text-muted">Review all completed calls and performance</p>
        </div>
        <button
          onClick={loadCalls}
          className="btn-primary inline-flex gap-2 items-center"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12l4-4m0 0l4 4m-4-4v12h16-12v-4" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            placeholder="Search by number or agent..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1) }}
            className="input input-sm"
          />
          <select
            value={agentFilter}
            onChange={e => { setAgentFilter(e.target.value); setPage(1) }}
            className="input"
          >
            <option value="">All Agents</option>
            {agentOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.extension})</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
            className="input"
          >
            <option value="">All Categories</option>
            {categoryOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="input"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="input"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-navy/5">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Caller</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Start Time</th>
              <th className="px-4 py-3">End Time</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center py-8 text-text-muted">Loading call history...</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-8 text-text-muted">No calls found</td></tr>
            ) : (
              calls.map((call, idx) => (
                <tr key={call.id} className="border-b border-border hover:bg-navy/5 transition">
                  <td className="px-4 py-3 text-sm text-text-muted">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-text-dark">{call.caller_number || '-'}</div>
                    {call.caller_name && (
                      <div className="text-xs text-text-muted">{call.caller_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {call.agent_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary"></span>
                        <span className="text-sm">{call.agent_name}</span>
                        {call.agent_extension && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {call.agent_extension}
                          </span>
                        )}
                      </span>
                    ) : <span className="text-text-muted text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {call.category_name ? (
                      <span className="text-sm text-text-dark">{call.category_name}</span>
                    ) : <span className="text-text-muted text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-dark">{formatTime(call.call_start)}</td>
                  <td className="px-4 py-3 text-sm text-text-dark">{formatTime(call.call_end)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-text-dark">{formatDuration(call.duration_sec || 0)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {call.recording_path && (
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="text-sm text-primary hover:underline"
                      >
                        ▶ Listen
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recording Modal */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             onClick={() => setSelectedCall(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-dark">Call Recording</h3>
              <button onClick={() => setSelectedCall(null)} className="text-text-muted hover:text-text-dark">✕</button>
            </div>
            <div className="mb-4 p-4 bg-navy/5 rounded-lg">
              <p className="text-sm text-text-dark">
                <strong>Caller:</strong> {selectedCall.caller_number}
              </p>
              <p className="text-sm text-text-dark">
                <strong>Agent:</strong> {selectedCall.agent_name}
              </p>
              <p className="text-sm text-text-dark">
                <strong>Duration:</strong> {formatDuration(selectedCall.duration_sec)}
              </p>
            </div>
            <a
              href={`${API}/api/v1/recordings/${selectedCall.id}/download/`}
              download="recording.wav"
              className="btn-primary w-full text-center block"
            >
              Download Recording
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
