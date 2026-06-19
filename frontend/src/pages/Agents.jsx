import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'

const API = '/api/v1'

export default function Agents() {
  const { token } = useAuth()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [statsMap, setStatsMap] = useState({})
  const [statsModalData, setStatsModalData] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', extension: '', email: '', status: 'active' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', extension: '', email: '', status: 'active' })
  const [savingCreate, setSavingCreate] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createMsg, setCreateMsg] = useState('')

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    accept: 'application/json',
  })

  const load = async () => {
    setLoading(true)
    try {
      const headers = authHeaders()
      const [{ data: summary }] = await Promise.all([
        axios.get(`${API}/reports/agents/summary/`, { headers }),
      ])
      const summaryList = Array.isArray(summary) ? summary : []
      const normalized = Object.fromEntries(
        summaryList.map((item) => {
          const key = String(item.agent_id ?? item.id ?? '')
          return [key, item]
        }),
      )
      setStatsMap(normalized)
      const [{ data: a }] = await Promise.all([
        axios.get(`${API}/agents/`, { headers }),
      ])
      const agents = Array.isArray(a) ? a : a.results || []
      setAgents(agents)
    } catch (e) {
      console.error('Failed to load agents', e)
      setAgents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setCreateForm({ name: '', extension: '', email: '', status: 'active' })
    setCreateError('')
    setCreateMsg('')
    setShowCreateModal(true)
  }

  const saveCreate = async () => {
    setCreateError('')
    if (!createForm.name.trim()) {
      setCreateError('Agent name is required')
      return
    }
    if (!createForm.extension.trim()) {
      setCreateError('Extension number is required')
      return
    }
    if (!createForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      setCreateError('Email is required and must be valid')
      return
    }

    setSavingCreate(true)
    try {
      const headers = authHeaders()
      const payload = {
        name: createForm.name.trim(),
        extension: createForm.extension.trim(),
        email: createForm.email.trim(),
        status: createForm.status,
      }
      await axios.post(`${API}/agents/`, payload, { headers })
      setShowCreateModal(false)
      setCreateMsg('Agent created')
      setTimeout(() => setCreateMsg(''), 2500)
      await load()
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create agent')
    } finally {
      setSavingCreate(false)
    }
  }
  const deleteAgent = async (id) => {
    try {
      const headers = authHeaders()
      await axios.delete(`${API}/agents/${id}/`, { headers })
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed')
    }
  }

  const openStats = async (agent) => {
    setStatsLoading(true)
    setStatsModalData({ ...agent, loading: true })
    try {
      const headers = authHeaders()
      const [{ data: history }] = await Promise.all([
        axios.get(`${API}/reports/call-history/?agent_id=${agent.id}&limit=50`, { headers }),
      ])

      const assignments = Array.isArray(agent.category_assignments) ? agent.category_assignments : []
      const categoryResults = await Promise.all(
        assignments.map((c) =>
          axios.get(`${API}/reports/categories/${c.category_id || c.id}/`, { headers }).catch(() => ({ data: null })),
        ),
      )

      const categories = assignments.map((c, idx) => {
        const categoryId = c.category_id ?? c.id
        const report = categoryResults[idx]?.data
        const agentStats = report?.agent_stats?.find((a) => a.agent_id === agent.id)
        return {
          id: categoryId,
          name: c.category_name || c.name || 'Category',
          weight: c.weight,
          total_calls: agentStats?.total_calls ?? 0,
          repeat_calls: agentStats?.repeat_calls ?? 0,
          avg_duration: agentStats?.avg_duration ?? 0,
          today_calls: agentStats?.today_calls ?? 0,
        }
      })
      const historyList = Array.isArray(history) ? history : []
      const agentSummary = {
        total_calls: Number(agent.total_calls || 0),
        repeat_calls: Number(agent.repeat_calls || 0),
        today_calls: Number((statsMap[agent.id] || {}).today_calls ?? 0),
        avg_duration: Number(
          categories.reduce((s, c) => s + (Number(c.avg_duration) || 0), 0) / (categories.length || 1),
        ).toFixed(2),
        unique_callers: new Set(historyList.map((h) => h.caller_number).filter(Boolean)).size,
        repeat_rate: (() => {
          const repeatCallers = new Set()
          const seen = new Set()
          historyList.forEach((h) => {
            const caller = h.caller_number
            if (!caller) return
            if (seen.has(caller)) repeatCallers.add(caller)
            seen.add(caller)
          })
          const total = seen.size || 0
          return total ? Number(((repeatCallers.size / total) * 100).toFixed(2)) : 0
        })(),
      }
      setStatsModalData({
        ...agent,
        summary: agentSummary,
        categories,
        history: historyList,
      })
    } catch (e) {
      console.error('Failed to load agent stats', e)
      setStatsModalData({ ...agent, summary: null, categories: [], history: [] })
    } finally {
      setStatsLoading(false)
    }
  }

  const openEdit = (agent) => {
    setEditForm({
      id: agent.id,
      name: agent.name || '',
      extension: agent.extension || '',
      email: agent.email || '',
      status: agent.status || 'active',
    })
    setEditModal(agent)
  }

  const saveEdit = async () => {
    if (!editModal) return
    setSavingEdit(true)
    try {
      const headers = authHeaders()
      await axios.put(
        `${API}/agents/${editForm.id}/`,
        {
          name: editForm.name,
          extension: editForm.extension,
          email: editForm.email,
          status: editForm.status,
        },
        { headers },
      )
      setEditModal(null)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save agent')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">Agent Management</h2>
          <p className="text-sm text-text-gray mt-1">{agents.length} agents</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Agent
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-bg-light">
              <tr>
                <th className="px-4 py-3 font-medium text-text-gray">Agent Name</th>
                <th className="px-4 py-3 font-medium text-text-gray">Extension</th>
                <th className="px-4 py-3 font-medium text-text-gray">Assigned Categories</th>
                <th className="px-4 py-3 text-right font-medium text-text-gray">Total Calls</th>
                <th className="px-4 py-3 text-right font-medium text-text-gray">Unique Callers</th>
                <th className="px-4 py-3 text-right font-medium text-text-gray">Repeat Rate</th>
                <th className="px-4 py-3 text-right font-medium text-text-gray">Today Calls</th>
                <th className="px-4 py-3 font-medium text-text-gray">Status</th>
                <th className="px-4 py-3 text-right font-medium text-text-gray">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-4 py-10 text-center text-text-gray">Loading agents...</td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-10 text-center text-text-muted">No agents found.</td>
                </tr>
              ) : (
                agents.map((agent) => {
                  const assignments = agent.category_assignments || []
                  const rowAgentId = String(agent.id ?? agent.agent_id ?? '')
                  const report = statsMap[rowAgentId] || {}
                  const categoryBadges = assignments.length
                    ? assignments
                        .map((c) => {
                          const label = typeof c?.name === 'string' ? c.name.trim() : 'Category'
                          const weight = typeof c?.weight === 'number' && !Number.isNaN(c.weight) ? c.weight : null
                          return weight !== null ? `${label || 'Category'} (${weight})` : label || 'Category'
                        })
                        .join(', ')
                    : 'No categories'
                  return (
                    <tr key={rowAgentId} className="border-t border-border last:border-0 hover:bg-bg-light/50 transition">
                      <td className="px-4 py-3 font-medium text-text-dark">{agent.name}</td>
                      <td className="px-4 py-3 text-text-gray">{agent.extension}</td>
                      <td className="px-4 py-3 text-xs text-text-gray">{categoryBadges}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{Number(statsMap[rowAgentId]?.total_calls ?? 0) || 0}</td>
                      <td className="px-4 py-3 text-right text-text-gray">{Number(statsMap[rowAgentId]?.unique_callers ?? 0) || 0}</td>
                      <td className="px-4 py-3 text-right text-text-gray">{Number(statsMap[rowAgentId]?.repeat_rate ?? 0) || 0}%</td>
                      <td className="px-4 py-3 text-right text-text-gray">{Number((statsMap[rowAgentId] || {}).today_calls ?? 0) || 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            agent.status === 'active' ? 'bg-success/15 text-success' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openStats(agent)}
                            className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                          >
                            Stats
                          </button>
                          <button
                            onClick={() => openEdit(agent)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy/5"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteAgent(rowAgentId)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute inset-0 overflow-y-auto py-6">
            <div className="min-h-full px-4">
              <div className="mx-auto w-full max-w-lg rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <h3 className="text-lg font-heading font-bold text-navy">Add Agent</h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                    type="button"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Agent Name</label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-text-gray">Extension</label>
                      <input
                        type="text"
                        value={createForm.extension}
                        onChange={(e) => setCreateForm({ ...createForm, extension: e.target.value })}
                        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Email</label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Status</label>
                    <select
                      value={createForm.status}
                      onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  {createError && <p className="text-xs text-red-600">{createError}</p>}
                  <button
                    onClick={saveCreate}
                    disabled={savingCreate}
                    className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {savingCreate ? 'Creating...' : 'Create Agent'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {statsModalData && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute inset-0 overflow-y-auto py-6">
            <div className="min-h-full px-4">
              <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <h3 className="text-lg font-heading font-bold text-navy">Agent Stats</h3>
                  <button
                    onClick={() => setStatsModalData(null)}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                    type="button"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6">
                  {statsLoading ? (
                    <div className="py-10 text-center text-text-gray">Loading stats...</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="rounded-xl border border-border bg-bg-light p-4">
                          <div className="text-xs text-text-gray">Total Calls</div>
                          <div className="mt-1 text-lg font-bold text-navy">{Number(statsModalData.summary?.total_calls ?? 0) || 0}</div>
                        </div>
                        <div className="rounded-xl border border-border bg-bg-light p-4">
                          <div className="text-xs text-text-gray">Unique Callers</div>
                          <div className="mt-1 text-lg font-bold text-navy">{Number(statsModalData.summary?.unique_callers ?? 0) || 0}</div>
                        </div>
                        <div className="rounded-xl border border-border bg-bg-light p-4">
                          <div className="text-xs text-text-gray">Repeat Rate</div>
                          <div className="mt-1 text-lg font-bold text-navy">{Number(statsModalData.summary?.repeat_rate ?? 0) || 0}%</div>
                        </div>
                        <div className="rounded-xl border border-border bg-bg-light p-4">
                          <div className="text-xs text-text-gray">Today Calls</div>
                          <div className="mt-1 text-lg font-bold text-navy">{Number(statsModalData.summary?.today_calls ?? 0) || 0}</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-navy">Categories</h4>
                        <div className="overflow-hidden rounded-xl border border-border">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-bg-light">
                              <tr>
                                <th className="px-3 py-2 font-medium text-text-gray">Category</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Weight</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Calls Taken</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Repeat Calls</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Today Calls</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(statsModalData.categories || []).length > 0 ? (
                                (statsModalData.categories || []).map((c) => (
                                  <tr key={c.id} className="border-t border-border">
                                    <td className="px-3 py-2">{c.name || 'Unknown'}</td>
                                    <td className="px-3 py-2">{c.weight ?? 0}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-navy">{Number(c.total_calls ?? 0) || 0}</td>
                                    <td className="px-3 py-2 text-right text-text-gray">{Number(c.repeat_calls ?? 0) || 0}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-navy">{Number(c.today_calls ?? 0) || 0}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan="5" className="px-3 py-4 text-center text-xs text-text-muted">
                                    No category assignments.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-navy">Recent Call History</h4>
                        <div className="overflow-hidden rounded-xl border border-border">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-bg-light">
                              <tr>
                                <th className="px-3 py-2 font-medium text-text-gray">Date</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Caller</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Agent</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Category</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {statsModalData.history && statsModalData.history.length > 0 ? (
                                statsModalData.history.slice(0, 20).map((h) => (
                                  <tr key={h.id} className="border-t border-border">
                                    <td className="px-3 py-2">
                                      {h.call_start ? String(h.call_start).slice(0, 19).replace('T', ' ') : '-'}
                                    </td>
                                    <td className="px-3 py-2">{h.caller_number || '-'}</td>
                                    <td className="px-3 py-2">{h.agent_name || '-'}</td>
                                    <td className="px-3 py-2">{h.category_name || '-'}</td>
                                    <td className="px-3 py-2">{h.duration_sec ?? '-'}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan="5" className="px-3 py-6 text-center text-xs text-text-muted">
                                    No recent calls found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute inset-0 overflow-y-auto py-6">
            <div className="min-h-full px-4">
              <div className="mx-auto w-full max-w-lg rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <h3 className="text-lg font-heading font-bold text-navy">Edit Agent</h3>
                  <button
                    onClick={() => setEditModal(null)}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                    type="button"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Agent Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Extension</label>
                    <input
                      type="text"
                      value={editForm.extension}
                      onChange={(e) => setEditForm({ ...editForm, extension: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-gray">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <button
                    onClick={saveEdit}
                    disabled={savingEdit}
                    className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
