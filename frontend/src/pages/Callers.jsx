import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'

const API = '/api/v1'
const PAGE_SIZES = [25, 50, 75, 100]

function Callers() {
  const { token } = useAuth()
  const [callers, setCallers] = useState([])
  const [blocklist, setBlocklist] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('callers')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(50)
  const [callerPage, setCallerPage] = useState(1)
  const [callersTotalItems, setCallersTotalItems] = useState(0)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockForm, setBlockForm] = useState({ phone_number: '', reason: '', destination: 'voicemail', destination_value: '' })
  const [selected, setSelected] = useState(new Set())

  // Caller detail (history view)
  const [selectedCaller, setSelectedCaller] = useState(null)
  const [callerHistory, setCallerHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const authHeaders = () => ({ Authorization: `Bearer ${token}`, accept: 'application/json' })

  const loadCallers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('page', String(callerPage))
      params.set('limit', String(pageSize))
      const res = await axios.get(`${API}/callers/?${params.toString()}`)
      const items = Array.isArray(res.data) ? res.data : []
      const totalFromHeaders = Number(res.headers?.['x-total-count'] || res.headers?.['x-total'] || 0)
      setCallers(items)
      setCallersTotalItems(totalFromHeaders || items.length)
    } catch (e) {
      console.error(e)
      setCallers([])
      setCallersTotalItems(0)
    } finally {
      setLoading(false)
      setSelected(new Set())
    }
  }

  const loadBlocklist = async () => {
    try {
      const res = await axios.get(`${API}/callers/blocklist/all/`)
      setBlocklist(res.data)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    loadCallers()
    loadBlocklist()
  }, [])

  useEffect(() => { setCallerPage(1) }, [search, pageSize])
  useEffect(() => { loadCallers() }, [search, callerPage, pageSize])

  const toggleSelect = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleSelectAll = () => {
    if (selected.size === callers.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(callers.map(c => c.id)))
    }
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} caller(s) and all their history?`)) return
    try {
      await axios.post(`${API}/callers/bulk-delete/`, { ids: Array.from(selected) }, { headers: authHeaders() })
      loadCallers()
    } catch (e) { alert(e.response?.data?.detail || 'Error deleting') }
  }

  const deleteCaller = async (id) => {
    try {
      await axios.delete(`${API}/callers/${id}/`, { headers: authHeaders() })
      await loadCallers()
    } catch (e) { alert(e.response?.data?.detail || 'Error') }
  }

  const blockCaller = async () => {
    try {
      await axios.post(`${API}/callers/blocklist/`, blockForm)
      setShowBlockForm(false)
      setBlockForm({ phone_number: '', reason: '', destination: 'voicemail', destination_value: '' })
      loadBlocklist()
      loadCallers()
    } catch (e) { alert(e.response?.data?.detail || 'Error') }
  }

  const unblockNumber = async (phoneNumber) => {
    if (!confirm(`Unblock ${phoneNumber}? It will return to the callers list.`)) return
    await axios.post(`${API}/callers/${encodeURIComponent(phoneNumber)}/unblock`, null, { headers: authHeaders() })
    loadBlocklist()
    loadCallers()
  }

  const viewHistory = async (caller) => {
    setSelectedCaller(caller)
    setHistoryLoading(true)
    try {
      const res = await axios.get(`${API}/callers/${encodeURIComponent(caller.caller_number)}/history`)
      setCallerHistory(res.data)
    } catch (e) { console.error(e) }
    setHistoryLoading(false)
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatNum = (n) => Number(n ?? 0).toLocaleString()

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(callersTotalItems / pageSize))

  const getPageNumbers = () => {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
      return pages
    }
    pages.push(1)
    if (callerPage > 3) pages.push('...')
    const startPage = Math.max(2, callerPage - 1)
    const endPage = Math.min(totalPages - 1, callerPage + 1)
    for (let i = startPage; i <= endPage; i++) pages.push(i)
    if (callerPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
    return pages
  }

  const pageNumbers = getPageNumbers()
  const startItem = (callerPage - 1) * pageSize + 1
  const endItem = Math.min(callerPage * pageSize, callersTotalItems)

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-12 bg-gray-100 rounded-lg" />
        <div className="h-96 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight">Callers</h1>
          <p className="text-sm text-text-gray mt-0.5">{formatNum(callersTotalItems)} total caller{callersTotalItems === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted whitespace-nowrap">Show</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="input text-sm min-w-[70px]"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-text-muted">per page</span>
          </div>
          <button onClick={() => setShowBlockForm(true)} className="btn-outline text-xs gap-1.5">
            + Block Number
          </button>
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="btn-danger text-xs">
              Delete ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('callers')}
          className={`px-5 py-3 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === 'callers' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark'
          }`}
        >
          All Callers ({callers.length})
        </button>
        <button
          onClick={() => setActiveTab('blocked')}
          className={`px-5 py-3 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === 'blocked' ? 'border-danger text-danger' : 'border-transparent text-text-muted hover:text-text-dark'
          }`}
        >
          Block List ({blocklist.filter(b => b.active).length})
        </button>
      </div>

      {/* ── Search ── */}
      <div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search callers by number or name..."
          className="input w-full md:w-80 text-sm"
        />
      </div>

      {/* ── Callers Tab ── */}
      {activeTab === 'callers' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-border">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === callers.length && callers.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Number</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Agent</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Calls</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Last Call</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {callers.map((c, i) => (
                  <tr key={c.id} className={`border-b border-border hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} ${selected.has(c.id) ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium font-mono text-xs">{c.caller_number}</td>
                    <td className="px-4 py-3 text-text-gray text-xs">{c.caller_name || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {c.last_category
                        ? <span className="text-text-dark font-medium">{c.last_category}</span>
                        : <span className="text-text-muted">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {c.last_agent_name ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                            {c.last_agent_name[0].toUpperCase()}
                          </div>
                          <div className="leading-tight">
                            <div className="text-text-dark text-xs font-medium">{c.last_agent_name}</div>
                            {c.last_agent_extension && <div className="text-text-muted text-[10px]">{c.last_agent_extension}</div>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-navy">{c.total_calls}</td>
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{formatDate(c.last_call_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => viewHistory(c)} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5">View</button>
                        <button onClick={() => deleteCaller(c.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {callers.length === 0 && (
                  <tr><td colSpan="8" className="px-4 py-12 text-center text-text-muted text-sm">No callers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {callers.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 border-t border-border bg-gray-50/40">
              <div className="text-xs text-text-muted">
                Showing <span className="font-medium text-text-dark">{startItem}</span>–<span className="font-medium text-text-dark">{endItem}</span> of{' '}
                <span className="font-medium text-text-dark">{formatNum(callersTotalItems)}</span> callers
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={callerPage <= 1}
                  onClick={() => setCallerPage((p) => Math.max(1, p - 1))}
                  className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium transition-colors ${
                    callerPage <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-light'
                  }`}
                >
                  Prev
                </button>
                {pageNumbers.map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="px-2 py-1 text-xs text-text-muted">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCallerPage(Number(p))}
                      className={`min-w-[2rem] px-3 py-1.5 rounded-lg border border-border text-xs font-medium transition-colors ${
                        p === callerPage ? 'bg-navy text-white border-navy' : 'hover:bg-bg-light text-text-dark'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  disabled={callerPage >= totalPages}
                  onClick={() => setCallerPage((p) => Math.min(totalPages, p + 1))}
                  className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium transition-colors ${
                    callerPage >= totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-light'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Block List Tab ── */}
      {activeTab === 'blocked' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-border">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Number</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Reason</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Destination</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blocklist.filter(b => b.active).map((b, i) => (
                  <tr key={b.id} className={`border-b border-border hover:bg-red-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium">{b.phone_number}</td>
                    <td className="px-4 py-3 text-xs text-text-gray">{b.reason || '—'}</td>
                    <td className="px-4 py-3 text-xs text-text-gray">{b.destination}{b.destination_value ? `: ${b.destination_value}` : ''}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => unblockNumber(b.phone_number)} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5">Unblock</button>
                    </td>
                  </tr>
                ))}
                {blocklist.filter(b => b.active).length === 0 && (
                  <tr><td colSpan="4" className="px-4 py-12 text-center text-text-muted text-sm">No blocked numbers.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Block Number Modal ── */}
      {showBlockForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBlockForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-navy mb-4">Block Number</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Phone Number</label>
                <input
                  type="text"
                  value={blockForm.phone_number}
                  onChange={e => setBlockForm(f => ({ ...f, phone_number: e.target.value }))}
                  placeholder="Enter phone number"
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Reason</label>
                <input
                  type="text"
                  value={blockForm.reason}
                  onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Block reason"
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Destination</label>
                <select
                  value={blockForm.destination}
                  onChange={e => setBlockForm(f => ({ ...f, destination: e.target.value }))}
                  className="input w-full text-sm"
                >
                  <option value="voicemail">Voicemail</option>
                  <option value="announcement">Announcement</option>
                  <option value="extension">Extension</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Destination Value</label>
                <input
                  type="text"
                  value={blockForm.destination_value}
                  onChange={e => setBlockForm(f => ({ ...f, destination_value: e.target.value }))}
                  placeholder="Extension number or announcement ID"
                  className="input w-full text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowBlockForm(false)} className="btn-outline text-sm px-4 py-2">Cancel</button>
              <button onClick={blockCaller} className="btn-danger text-sm px-4 py-2">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Caller History Modal ── */}
      {selectedCaller && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedCaller(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-navy">Call History</h3>
                <p className="text-sm text-text-muted">{selectedCaller.caller_number}</p>
              </div>
              <button onClick={() => setSelectedCaller(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-text-muted">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-3">
              {historyLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
                </div>
              ) : callerHistory.length === 0 ? (
                <p className="text-center text-text-muted py-8 text-sm">No call history for this caller.</p>
              ) : (
                callerHistory.map((h) => (
                  <div key={h.id} className="border border-border rounded-lg p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                          {h.agent_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-text-dark">{h.agent_name || 'Unknown'}</div>
                          <div className="text-xs text-text-muted">{h.category_name || '—'}{h.did_number ? ` · ${h.did_number}` : ''}</div>
                        </div>
                      </div>
                      <div className="text-right text-xs text-text-muted whitespace-nowrap">
                        <div>{h.call_start ? new Date(h.call_start).toLocaleString() : '—'}</div>
                        <div className="font-mono text-text-gray">
                          {h.duration_sec > 0 ? `${Math.floor(h.duration_sec / 60)}m ${h.duration_sec % 60}s` : `${h.duration_sec}s`}
                        </div>
                      </div>
                    </div>
                    {h.is_repeat && <div className="mt-2"><span className="badge badge-warning text-[10px]">Repeat</span></div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Callers
