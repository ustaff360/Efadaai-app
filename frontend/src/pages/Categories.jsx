import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'

const API = '/api/v1'

export default function Categories() {
  const { token } = useAuth()
  const [categories, setCategories] = useState([])
  const [statsMap, setStatsMap] = useState({})
  const [didsMap, setDidsMap] = useState({})
  const [agentStatsMap, setAgentStatsMap] = useState({})
  const [assignmentWeightMap, setAssignmentWeightMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [formDids, setFormDids] = useState([])
  const [newDid, setNewDid] = useState({ did_number: '', description: '' })
  const [editDid, setEditDid] = useState(null)
  const [allAgents, setAllAgents] = useState([])
  const [selectedAgents, setSelectedAgents] = useState([])
  const [statsModalData, setStatsModalData] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [catSearch, setCatSearch] = useState('')
  const [categoryMsg, setCategoryMsg] = useState('')

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    accept: 'application/json',
  })

  const load = async () => {
    setLoading(true)
    try {
      const headers = authHeaders()
      const [{ data: c }] = await Promise.all([
        axios.get(`${API}/reports/categories/`, { headers }).catch(() => ({ data: [] })),
      ])
      const itemsRaw = Array.isArray(c) ? c : []
      const items = itemsRaw.map((it) => ({
        ...it,
        id: it.category_id ?? it.id,
        name: it.category_name ?? it.name,
        category_agents: (it.agent_stats || []).map((a) => ({
          agent_id: a.agent_id,
          agent_name: a.agent_name,
          extension: a.extension,
          override_weight: a.weight ?? 0,
        })),
      }))
      setCategories(items)
      const ids = items.map((it) => it.id)

      // reused headers immediately above
      const statsResults = await Promise.all(
        ids.map((id) =>
          axios
            .get(`${API}/reports/categories/${id}/`, { headers })
            .then((r) => ({ id, data: r.data }))
            .catch(() => ({ id, data: null })),
        ),
      )

      const histResults = await Promise.all(
        ids.map((id) =>
          axios
            .get(`${API}/reports/call-history/`, { params: { category_id: id, limit: 50 }, headers })
            .then((r) => ({ id, data: Array.isArray(r.data) ? r.data : [] }))
            .catch(() => ({ id, data: [] })),
        ),
      )
      const historyById = Object.fromEntries(histResults.map(({ id, data }) => [id, data]))

      const nextStats = {}
      const nextDids = {}
      const nextAgentStats = {}
      const nextAssignWeight = {}
      for (const { id, data } of statsResults) {
        if (!data) continue
        const history = historyById[id] || []
        const summary = data.summary || {}
        nextStats[id] = { ...summary, today_calls: Number(summary.today_calls ?? 0) }
        nextDids[id] = Array.isArray(data.dids) ? data.dids : []
        nextAgentStats[id] = (data.agent_stats || []).map((a) => ({
          agent_id: a.agent_id,
          agent_name: a.agent_name,
          extension: a.extension,
          total_calls: a.total_calls ?? 0,
          repeat_calls: a.repeat_calls ?? 0,
          avg_duration: a.avg_duration ?? 0,
          weight: a.weight ?? 0,
          today_calls: Number(a.today_calls ?? 0),
        }))
      }

      const assignResults = await Promise.all(
        ids.map((id) =>
          axios
            .get(`${API}/categories/${id}/agents/`)
            .then((r) => ({ id, data: r.data }))
            .catch(() => ({ id, data: [] })),
        ),
      )
      for (const { id, data } of assignResults) {
        const list = Array.isArray(data) ? data : []
        const map = {}
        list.forEach((row) => {
          map[row.agent_id] = row.override_weight ?? 0
        })
        nextAssignWeight[id] = map
      }

      setStatsMap(nextStats)
      setDidsMap(nextDids)
      setAgentStatsMap(nextAgentStats)
      setAssignmentWeightMap(nextAssignWeight)
      const { data: a } = await axios.get(`${API}/agents/`).catch(() => ({ data: [] }))
      setAllAgents(Array.isArray(a) ? a : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setEditCat(null)
    setForm({ name: '', description: '' })
    setFormDids([])
    setNewDid({ did_number: '', description: '' })
    setEditDid(null)
    setSelectedAgents([])
    setShowForm(false)
  }

  const openCreate = async () => {
    resetForm()
    await loadAgents()
    setShowForm(true)
  }

  const openEdit = async (cat) => {
    setEditCat(cat)
    setForm({ name: cat.name, description: cat.description || '' })
    setFormDids((cat.dids || []).map((d) => ({ id: d.id, did_number: d.did_number, description: d.description || '' })))
    setNewDid({ did_number: '', description: '' })
    setEditDid(null)
    setSelectedAgents([])
    await loadAgents()
    const [{ data: assignments }] = await Promise.all([
      axios.get(`${API}/categories/${cat.id}/agents/`).catch(() => ({ data: [] })),
    ])
    setSelectedAgents(
      (assignments || []).map((a) => ({
        id: a.id,
        agent_id: a.agent_id,
        agent_name: a.agent_name,
        agent_extension: a.agent_extension,
        strategy: a.routing_strategy || 'weighted',
        weight: a.override_weight ?? '',
        active: a.active,
      })),
    )
    setShowForm(true)
  }

  const loadAgents = async () => {
    try {
      const { data } = await axios.get(`${API}/agents/`)
      setAllAgents(Array.isArray(data) ? data : [])
    } catch {
      setAllAgents([])
    }
  }

  const saveCategory = async () => {
    try {
      if (!form.name.trim()) {
        alert('Category name is required')
        return
      }
      const saved = editCat
        ? await axios.put(`${API}/categories/${editCat.id}/`, form)
        : await axios.post(`${API}/categories/`, form)
      const categoryId = editCat ? editCat.id : saved?.data?.data?.id
      if (!categoryId) throw new Error(saved?.message || 'Category save did not return an id')
      await Promise.all(
        formDids
          .filter((did) => !did.id)
          .map((did) =>
            axios.post(`${API}/categories/${categoryId}/dids/`, { did_number: did.did_number, description: did.description || '' }),
          ),
      )
      const seen = new Set()
      await Promise.all(
        selectedAgents.map((sa) => {
          if (sa.id) {
            if (!seen.has(sa.id)) {
              seen.add(sa.id)
              return axios.put(
                `${API}/categories/${categoryId}/agents/${sa.id}/`,
                {
                  ...(typeof sa.weight === 'number' && !Number.isNaN(sa.weight) ? { override_weight: sa.weight } : {}),
                  ...(sa.strategy ? { routing_strategy: sa.strategy } : {}),
                  active: sa.active ?? true,
                },
              )
            }
            return Promise.resolve()
          }
          return axios.post(
            `${API}/categories/${categoryId}/agents/`,
            {
              agent_id: sa.agent_id,
              ...(typeof sa.weight === 'number' && !Number.isNaN(sa.weight) ? { override_weight: sa.weight } : {}),
              ...(sa.strategy ? { routing_strategy: sa.strategy } : {}),
              active: sa.active ?? true,
            },
          )
        }),
      )
      resetForm()
      await load()
      setCategoryMsg(editCat ? 'Category updated' : 'Category created')
      setTimeout(() => setCategoryMsg(''), 2500)
    } catch (err) {
      const raw = typeof err === 'object' && err?.response?.data?.detail !== undefined
        ? err.response.data.detail
        : typeof err === 'object' && err?.message
          ? err.message
          : 'Unknown error'
      const detail = typeof raw === 'string' ? raw : JSON.stringify(raw)
      alert('Error saving category: ' + detail)
    }
  }

  const toggleStatus = async (cat) => {
    try {
      const action = cat.status === 'active' ? 'deactivate' : 'activate'
      await axios.post(`${API}/categories/${cat.id}/${action}/`, {}, { headers: authHeaders() })
      await load()
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.detail || err.message))
    }
  }

  const deleteCategory = async (id) => {
    try {
      await axios.delete(`${API}/categories/${id}/`, { headers: authHeaders() })
      await load()
    } catch (err) {
      alert('Failed to delete: ' + (err.response?.data?.detail || err.message))
    }
  }

  const openCategoryStats = async (cat) => {
    setStatsLoading(true)
    setStatsModalData({ ...cat, loading: true })
    try {
      const [summaryRes, historyRes, assignRes] = await Promise.all([
        axios.get(`${API}/reports/categories/${cat.id}/`),
        axios.get(`${API}/reports/call-history/?category_id=${cat.id}&limit=50`),
        axios.get(`${API}/categories/${cat.id}/agents/`),
      ])
      const history = Array.isArray(historyRes.data) ? historyRes.data : []
      const assignments = Array.isArray(assignRes.data) ? assignRes.data : []
      const assignedAgentIds = new Set((assignments || []).map((a) => a.agent_id))
      const agentStats = (summaryRes.data.agent_stats || [])
        .filter((ag) => assignedAgentIds.has(ag.agent_id))
        .map((ag) => {
          const enriched = {
            agent_id: ag.agent_id,
            agent_name: ag.agent_name,
            extension: ag.extension,
            total_calls: ag.total_calls ?? 0,
            repeat_calls: ag.repeat_calls ?? 0,
            avg_duration: ag.avg_duration ?? 0,
            weight: ag.weight ?? 0,
            today_calls: Number(ag.today_calls ?? 0) || 0,
          }
          if (!enriched.today_calls) {
            const mapped = statsMap[ag.agent_id]
            if (mapped?.today_calls) enriched.today_calls = Number(mapped.today_calls)
          }
          return enriched
        })
      setStatsModalData({
        ...cat,
        summary: summaryRes.data.summary || null,
        agent_stats: agentStats,
        assignments,
        history,
      })
    } catch (err) {
      console.error('Failed to load category stats', err)
      setStatsModalData({ ...cat, summary: null, agent_stats: [], history: [] })
    } finally {
      setStatsLoading(false)
    }
  }

  const addDid = () => {
    if (!newDid.did_number.trim()) return
    setFormDids((previous) => [...previous, { ...newDid, _tempId: Date.now() }])
    setNewDid({ did_number: '', description: '' })
  }

  const updateDid = (index) => {
    if (!newDid.did_number.trim()) return
    setFormDids((previous) => {
      const next = [...previous]
      next[index] = { ...next[index], did_number: newDid.did_number, description: newDid.description }
      return next
    })
    setEditDid(null)
    setNewDid({ did_number: '', description: '' })
  }

  const removeDid = async (index) => {
    const did = formDids[index]
    if (did.id && editCat) {
      await axios.delete(`${API}/categories/${editCat.id}/dids/${did.id}/`, { headers: authHeaders() }).catch(() => {})
    }
    setFormDids((previous) => previous.filter((_, i) => i !== index))
  }

  const toggleAgent = async (agent) => {
    const existingIndex = selectedAgents.findIndex((sa) => sa.agent_id === agent.id)
    if (existingIndex >= 0) {
      const existing = selectedAgents[existingIndex]
      if (existing.id && editCat) {
        if (!confirm('Remove agent from this category?')) return
        await axios.delete(`${API}/categories/${editCat.id}/agents/${existing.id}/`, { headers: authHeaders() }).catch(() => {})
      }
      setSelectedAgents((previous) => previous.filter((_, i) => i !== existingIndex))
      return
    }
    setSelectedAgents((previous) => [
      ...previous,
      {
        id: null,
        agent_id: agent.id,
        agent_name: agent.name,
        agent_extension: agent.extension,
        strategy: 'weighted',
        weight: '',
      },
    ])
  }

  const updateAgentField = (agentId, field, value) => {
    setSelectedAgents((previous) => previous.map((sa) => (sa.agent_id === agentId ? { ...sa, [field]: value } : sa)))
  }

  if (loading) return <div className="text-center py-10 text-text-gray">Loading categories...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">Category Management</h2>
          <p className="text-sm text-text-gray mt-1">{categories.length} categor{categories.length === 1 ? 'y' : 'ies'} configured</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {categoryMsg && <span className="text-xs text-green-700">{categoryMsg}</span>}
          <button
          onClick={openCreate}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Category
        </button>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={catSearch}
          onChange={e => setCatSearch(e.target.value)}
          placeholder="Search categories by name..."
          className="input w-full md:w-80 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-bg-light">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Assigned Agents</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">DIDs</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Total Calls</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Unique Callers</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Repeat Rate</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Today Calls</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-text-muted">
                    No categories yet. Use <span className="font-medium text-primary">Add Category</span> to create one.
                  </td>
                </tr>
              ) : (
                categories
                  .filter(function(cat) {
                    if (!catSearch) return true
                    return (cat.name || '').toLowerCase().indexOf(catSearch.toLowerCase()) >= 0
                  })
                  .map((cat) => {
                  const stats = statsMap[cat.id] || {}
                  const dids = didsMap[cat.id] || []
                  const agentStats = agentStatsMap[cat.id] || []
                  const weightByAgent = assignmentWeightMap[cat.id] || {}
                  const agentBadges = (agentStats || [])
                    .slice(0, 6)
                    .map((a) => {
                      const agentName = typeof a?.agent_name === 'string' ? a.agent_name.trim() : ''
                      const label = agentName || 'Agent'
                      const weight = typeof a?.override_weight === 'number' ? a.override_weight : (typeof a?.weight === 'number' ? a.weight : 0)
                      return `${label} (${weight})`
                    })
                    .join(', ')
                  const assignedAgentCount = (agentStats || []).length

                  return (
                    <tr key={cat.id} className="border-t border-border last:border-0 hover:bg-bg-light/50 transition">
                      <td className="px-4 py-3 font-medium text-text-dark">{cat.name}</td>
                      <td className="px-4 py-3 text-xs text-text-gray">
                        <div className="line-clamp-2">{agentBadges || 'No agents'}</div>
                        <div className="text-text-muted">{assignedAgentCount} agent{assignedAgentCount === 1 ? '' : 's'} assigned</div>
                      </td>
                      <td className="px-4 py-3">
                        {dids.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {dids.map((d) => (
                              <span key={d.id || d.did_number} className="inline-flex items-center rounded-md bg-navy/10 px-2 py-0.5 text-xs text-navy">{d.did_number}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">No DIDs</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{Number(stats.total_calls ?? 0) || 0}</td>
                      <td className="px-4 py-3 text-right text-text-gray">{Number(stats.unique_callers ?? 0) || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{Number(stats.repeat_rate ?? 0) || 0}%</span>
                      </td>
                      <td className="px-4 py-3 text-right text-text-gray">{Number(stats.today_calls ?? 0) || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openCategoryStats(cat)}
                            className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                          >
                            Stats
                          </button>
                          <button
                            onClick={() => openEdit(cat)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy/5"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCategory(cat.id)}
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

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute inset-0 overflow-y-auto py-6">
            <div className="min-h-full px-4">
              <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <h3 className="text-lg font-heading font-bold text-navy">{editCat ? 'Edit Category' : 'Add Category'}</h3>
                  <button
                    onClick={() => resetForm()}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                    type="button"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-6 p-6">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-text-gray">Category Name</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                        placeholder="Sales, Support..."
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-text-gray">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-navy">Phone Numbers (DIDs)</h4>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newDid.did_number}
                        onChange={(event) => setNewDid({ ...newDid, did_number: event.target.value })}
                        className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                        placeholder="+155****1234"
                      />
                      <input
                        type="text"
                        value={newDid.description}
                        onChange={(event) => setNewDid({ ...newDid, description: event.target.value })}
                        className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                        placeholder="Main Line"
                      />
                      <button
                        onClick={editDid !== null ? () => updateDid(editDid) : addDid}
                        className="rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-light"
                      >
                        {editDid !== null ? 'Update' : 'Add'}
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {formDids.map((did, idx) => (
                        <div key={did.id || did._tempId || idx} className="flex items-center justify-between rounded-xl border border-border bg-bg-light px-3 py-2.5">
                          <div>
                            <div className="text-sm font-medium text-text-dark">{did.did_number}</div>
                            {did.description && <div className="text-xs text-text-muted">{did.description}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditDid(idx)
                                setNewDid({ did_number: did.did_number, description: did.description || '' })
                              }}
                              className="text-xs text-navy hover:underline"
                            >
                              Edit
                            </button>
                            <button onClick={() => removeDid(idx)} className="text-xs text-danger hover:underline">
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                      {formDids.length === 0 && <p className="text-xs text-text-muted">No DIDs added yet.</p>}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-navy">Assigned Agents</h4>
                      <span className="text-xs text-text-muted">{selectedAgents.length} selected</span>
                    </div>
                    {allAgents.length === 0 ? (
                      <p className="text-sm text-text-muted">No agents available. <span className="text-primary">Create agents first.</span></p>
                    ) : (
                      <div className="space-y-2">
                        {allAgents.map((agent) => {
                          const selected = selectedAgents.some((sa) => sa.agent_id === agent.id)
                          const selectedRow = selectedAgents.find((sa) => sa.agent_id === agent.id)
                          return (
                            <div
                              key={agent.id}
                              className={`rounded-xl border p-3 transition ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleAgent(agent)}
                                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-text-dark">{agent.name}</div>
                                  <div className="text-xs text-text-gray">Extension {agent.extension}</div>
                                </div>
                                {selected && selectedRow && (
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={selectedRow.strategy}
                                      onChange={(e) => updateAgentField(agent.id, 'strategy', e.target.value)}
                                      className="rounded-lg border border-border px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                                    >
                                      <option value="weighted">Weighted</option>
                                      <option value="round_robin">Round Robin</option>
                                      <option value="sequential">Sequential</option>
                                    </select>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={selectedRow.weight}
                                      onChange={(e) => updateAgentField(agent.id, 'weight', Number(e.target.value))}
                                      className="w-20 rounded-lg border border-border px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                                      placeholder="Weight"
                                    />
                                    <label className="flex items-center gap-1 text-xs text-text-gray">
                                      <input
                                        type="checkbox"
                                        checked={!!selectedRow.active}
                                        onChange={(e) => updateAgentField(agent.id, 'active', e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                                      />
                                      Active
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => resetForm()}
                      className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-navy hover:bg-navy/5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveCategory}
                      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
                    >
                      {editCat ? 'Save Changes' : 'Create Category'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {statsModalData && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setStatsModalData(null)}>
          <div className="flex flex-col w-full max-w-3xl max-h-[85vh] rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-6 py-5 shrink-0">
              <h3 className="text-lg font-heading font-bold text-navy">Category Stats</h3>
              <button
                onClick={() => setStatsModalData(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-text-muted"
                aria-label="Close"
                type="button"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
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
                        <h4 className="mb-2 text-sm font-semibold text-navy">Assigned Agents</h4>
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-bg-light">
                              <tr>
                                <th className="px-3 py-2 font-medium text-text-gray">Agent</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Extension</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Weight</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Calls Taken</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Repeat Calls</th>
                                <th className="px-3 py-2 text-right font-medium text-text-gray">Today Calls</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(!statsModalData.agent_stats || statsModalData.agent_stats.length === 0) ? (
                                <tr>
                                  <td colSpan="6" className="px-3 py-4 text-center text-xs text-text-muted">
                                    No assigned agents found.
                                  </td>
                                </tr>
                              ) : (
                                statsModalData.agent_stats.map((ag) => (
                                  <tr key={ag.agent_id} className="border-t border-border">
                                    <td className="px-3 py-2">{ag.agent_name || 'Unknown'}</td>
                                    <td className="px-3 py-2">{ag.extension || '-'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-navy">{ag.weight ?? 0}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-navy">{ag.total_calls ?? 0}</td>
                                    <td className="px-3 py-2 text-right text-text-gray">{ag.repeat_calls ?? 0}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-navy">{ag.today_calls ?? 0}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-navy">Recent Call History</h4>
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-bg-light">
                              <tr>
                                <th className="px-3 py-2 font-medium text-text-gray">Date</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Caller</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Agent</th>
                                <th className="px-3 py-2 font-medium text-text-gray">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {statsModalData.history && statsModalData.history.length > 0 ? (
                                statsModalData.history.slice(0, 20).map((h) => (
                                  <tr key={h.id} className="border-t border-border">
                                    <td className="px-3 py-2">{h.call_start ? String(h.call_start).slice(0, 19).replace('T', ' ') : '-'}</td>
                                    <td className="px-3 py-2">{h.caller_number || '-'}</td>
                                    <td className="px-3 py-2">{h.agent_name || '-'}</td>
                                    <td className="px-3 py-2">{h.duration_sec ?? '-'}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan="4" className="px-3 py-6 text-center text-xs text-text-muted">No recent calls found.</td>
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
      )}
    </div>
  )
}
