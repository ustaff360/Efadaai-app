import React, { useEffect, useState } from 'react'
import axios from 'axios'

const API = '/api/v1'
const PAGE_SIZE_OPTIONS = [25, 50, 75, 100]
const PAGE_SIZE_DEFAULT = 50

function Callers() {
  const [callers, setCallers] = useState([])
  const [blocklist, setBlocklist] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('callers')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  const [callerPage, setCallerPage] = useState(1)
  const [callersTotalItems, setCallersTotalItems] = useState(0)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockForm, setBlockForm] = useState({ phone_number: '', reason: '', destination: 'voicemail', destination_value: '' })
  const [selected, setSelected] = useState(new Set())

  // Caller detail (history view)
  const [selectedCaller, setSelectedCaller] = useState(null)
  const [callerHistory, setCallerHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

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
      await axios.post(`${API}/callers/bulk-delete/`, { ids: Array.from(selected) })
      loadCallers()
    } catch (e) { alert(e.response?.data?.detail || 'Error deleting') }
  }

  const deleteCaller = async (id) => {
    if (!confirm('Delete this caller and all their history?')) return
    try {
      await axios.delete(`${API}/callers/${id}`)
      loadCallers()
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
    await axios.post(`${API}/callers/${encodeURIComponent(phoneNumber)}/unblock`)
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
    const date = new Date(d)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const formatDateTime = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  const formatDuration = (sec) => {
    if (!sec) return '0s'
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }

  if (loading) return <div className="text-center py-10 text-text-gray">Loading...</div>

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">Callers</h2>
          <p className="text-sm text-text-gray mt-0.5">{callersTotalItems.toLocaleString()} total caller{callersTotalItems === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-gray">Show</label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-border rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-gray">per page</span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="bg-danger text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium">
              Delete ({selected.size})
            </button>
          )}
          <button onClick={() => setShowBlockForm(true)} className="bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy-light transition text-sm font-medium">
            + Block Number
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        <button onClick={() => setActiveTab('callers')} className={`px-6 py-3 text-sm font-medium transition ${activeTab === 'callers' ? 'border-b-2 border-primary text-primary' : 'text-text-gray hover:text-text-dark'}`}>
          All Callers ({callers.length})
        </button>
        <button onClick={() => setActiveTab('blocked')} className={`px-6 py-3 text-sm font-medium transition ${activeTab === 'blocked' ? 'border-b-2 border-danger text-danger' : 'text-text-gray hover:text-text-dark'}`}>
          Block List ({blocklist.filter(b => b.active).length})
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search callers by number or name..."
          className="w-full md:w-80 border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {/* Callers Tab */}
      {activeTab === 'callers' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[650px]">
              <thead className="bg-bg-light">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === callers.length && callers.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium text-text-gray">Number</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Name</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Category</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Agent</th>
                  <th className="px-4 py-3 font-medium text-text-gray text-right">Calls</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Last Call</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Actions</th>
                </tr>
              </thead>
              <tbody>
                {callers.map(c => (
                  <tr key={c.id} className={`border-t border-border hover:bg-bg-light/50 transition ${selected.has(c.id) ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium font-mono">{c.caller_number}</td>
                    <td className="px-4 py-3 text-text-gray">{c.caller_name || '—'}</td>
                    <td className="px-4 py-3">
                      {c.last_category
                        ? <span className="text-text-dark">{c.last_category}</span>
                        : <span className="text-text-muted">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {c.last_agent_name ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary text-[10px] font-bold">
                            {c.last_agent_name[0].toUpperCase()}
                          </div>
                          <div>
                            <span className="text-text-dark text-xs">{c.last_agent_name}</span>
                            {c.last_agent_extension && <span className="text-text-muted text-[10px] ml-1">({c.last_agent_extension})</span>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-navy">{c.total_calls}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDate(c.last_call_at)}</td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => viewHistory(c)} className="text-primary hover:underline text-xs font-medium">View</button>
                      <button onClick={() => deleteCaller(c.id)} className="text-danger hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
                {callers.length === 0 && (
                  <tr><td colSpan="8" className="px-4 py-8 text-center text-text-muted">No callers found.</td></tr>
                )}
                </tbody>
                </table>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
                <div className="text-xs text-text-gray">
                Showing {(callerPage - 1) * pageSize + 1}-
                {Math.min(callerPage * pageSize, callersTotalItems)} of {callersTotalItems.toLocaleString()} callers
                </div>
                <div className="flex items-center gap-1">
                <button
                  disabled={callerPage <= 1}
                  onClick={() => setCallerPage((p) => Math.max(1, p - 1))}
                  className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium ${callerPage <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-light'}`}
                >
                  Prev
                </button>
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(callersTotalItems / pageSize))
                  const getPages = () => {
                    const pages = new Set()
                    if (totalPages <= 7) {
                      Array.from({ length: totalPages }, (_, i) => i + 1).forEach((n) => pages.add(n))
                      return Array.from(pages)
                    }
                    pages.add(1)
                    pages.add(totalPages)
                    const start = Math.max(2, callerPage - 1)
                    const end = Math.min(totalPages - 1, callerPage + 1)
                    pages.add(start)
                    pages.add(end)
                    if (start > 2) pages.add('...')
                    if (end < totalPages - 1) pages.add('...')
                    return Array.from(pages)
                  }
                  const pages = getPages()
                  return pages.map((p, i) => (
                    <button
                      key={`${p}-${i}`}
                      disabled={p === '...'}
                      onClick={() => p !== '...' && setCallerPage(Number(p))}
                      className={`min-w-[2rem] px-3 py-1.5 rounded-lg border border-border text-xs font-medium ${p === callerPage ? 'bg-navy text-white border-navy' : p === '...' ? 'opacity-50 cursor-default' : 'hover:bg-bg-light'}`}
                    >
                      {p}
                    </button>
                  ))
                })()}
                <button
                  disabled={callerPage >= Math.max(1, Math.ceil(callersTotalItems / pageSize))}
                  onClick={() => setCallerPage((p) => Math.min(Math.ceil(callersTotalItems / pageSize), p + 1))}
                  className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium ${callerPage >= Math.max(1, Math.ceil(callersTotalItems / pageSize)) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-light'}`}
                >
                  Next
                </button>
                </div>
                </div>
                </div>
                )}

      {/* Block List Tab */}
      {activeTab === 'blocked' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[500px]">
              <thead className="bg-bg-light">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-gray">Number</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Reason</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Destination</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Added</th>
                  <th className="px-4 py-3 font-medium text-text-gray">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blocklist.map(b => (
                  <tr key={b.id} className="border-t border-border hover:bg-bg-light/50 transition">
                    <td className="px-4 py-3 font-medium font-mono">{b.phone_number}</td>
                    <td className="px-4 py-3 text-text-gray">{b.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-navy/10 text-navy">{b.destination}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => unblockNumber(b.phone_number)} className="text-primary hover:underline text-xs font-medium">Unblock</button>
                    </td>
                  </tr>
                ))}
                {blocklist.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-text-muted">No blocked numbers.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Block Form Modal */}
      {showBlockForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-lg font-heading font-bold text-navy mb-4">Block Number</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Phone Number</label>
                <input type="text" value={blockForm.phone_number} onChange={e => setBlockForm({ ...blockForm, phone_number: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-danger focus:outline-none" placeholder="+15551234567" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Reason</label>
                <input type="text" value={blockForm.reason} onChange={e => setBlockForm({ ...blockForm, reason: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-danger focus:outline-none" placeholder="Spam, harassment, etc." />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Route Blocked Calls To</label>
                <select value={blockForm.destination} onChange={e => setBlockForm({ ...blockForm, destination: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-danger focus:outline-none">
                  <option value="voicemail">Voicemail</option>
                  <option value="announcement">Announcement</option>
                  <option value="extension">Specific Extension</option>
                </select>
              </div>
              {blockForm.destination === 'extension' && (
                <div>
                  <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Extension Number</label>
                  <input type="text" value={blockForm.destination_value} onChange={e => setBlockForm({ ...blockForm, destination_value: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-danger focus:outline-none" placeholder="e.g. 999" />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowBlockForm(false)} className="flex-1 bg-bg-light py-2.5 rounded-lg hover:bg-border transition text-sm font-medium">Cancel</button>
              <button onClick={blockCaller} className="flex-1 bg-danger text-white py-2.5 rounded-lg hover:bg-red-700 transition text-sm font-medium">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* Caller History Modal */}
      {selectedCaller && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-navy to-navy-light text-white">
              <div>
                <h3 className="text-lg font-heading font-bold">{selectedCaller.caller_number}</h3>
                {selectedCaller.caller_name && (
                  <p className="text-sm text-gray-300">{selectedCaller.caller_name}</p>
                )}
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-xs text-gray-400 uppercase">Total Calls</div>
                  <div className="text-xl font-bold">{selectedCaller.total_calls}</div>
                </div>
                <button
                  onClick={() => { setSelectedCaller(null); setCallerHistory([]) }}
                  className="p-2 hover:bg-white/10 rounded-lg transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* History Table */}
            <div className="flex-1 overflow-y-auto">
              {historyLoading ? (
                <div className="text-center py-10 text-text-gray text-sm">Loading history...</div>
              ) : callerHistory.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-text-muted text-sm">No call history found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-bg-light sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-medium text-text-gray">Date & Time</th>
                        <th className="px-4 py-3 font-medium text-text-gray">Attended By</th>
                        <th className="px-4 py-3 font-medium text-text-gray">Category</th>
                        <th className="px-4 py-3 font-medium text-text-gray">DID</th>
                        <th className="px-4 py-3 font-medium text-text-gray text-right">Duration</th>
                        <th className="px-4 py-3 font-medium text-text-gray">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {callerHistory.map((h, i) => (
                        <tr key={h.id || i} className="border-t border-border hover:bg-bg-light/50 transition">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-text-dark font-medium">{formatDateTime(h.call_start)}</div>
                            {h.call_end && (
                              <div className="text-[11px] text-text-muted">Ended: {formatDateTime(h.call_end)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {h.agent_name ? (
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center text-primary text-xs font-bold">
                                  {h.agent_name[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-text-dark">{h.agent_name}</div>
                                  {h.agent_extension && <div className="text-[11px] text-text-muted">Ext: {h.agent_extension}</div>}
                                </div>
                              </div>
                            ) : (
                              <span className="text-text-muted italic">No agent assigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-text-gray">{h.category_name || '—'}</td>
                          <td className="px-4 py-3 text-text-gray font-mono text-xs">{h.did_number || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatDuration(h.duration_sec)}</td>
                          <td className="px-4 py-3">
                            {h.is_blocked ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">🚫 Blocked</span>
                            ) : h.is_repeat ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">🔄 Repeat</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">📞 New</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border bg-bg-light text-right">
              <button
                onClick={() => { setSelectedCaller(null); setCallerHistory([]) }}
                className="bg-white border border-border px-5 py-2 rounded-lg text-sm font-medium hover:bg-border transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Callers
