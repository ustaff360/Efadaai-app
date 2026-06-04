import React, { useEffect, useState } from 'react'
import axios from 'axios'

const API = '/api/v1'

function Agents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editAgent, setEditAgent] = useState(null)
  const [form, setForm] = useState({ name: '', extension: '', email: '', default_weight: 100 })
  const [stats, setStats] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [search, setSearch] = useState('')

  const loadAgents = async () => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await axios.get(`${API}/agents/${params}`)
      setAgents(res.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadAgents() }, [search])

  const openCreate = () => {
    setEditAgent(null)
    setForm({ name: '', extension: '', email: '', default_weight: 100 })
    setShowForm(true)
  }

  const openEdit = (agent) => {
    setEditAgent(agent)
    setForm({ name: agent.name, extension: agent.extension, email: agent.email || '', default_weight: agent.default_weight })
    setShowForm(true)
  }

  const saveAgent = async () => {
    try {
      if (editAgent) {
        await axios.put(`${API}/agents/${editAgent.id}`, form)
      } else {
        await axios.post(`${API}/agents/`, form)
      }
      setShowForm(false)
      loadAgents()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error saving agent')
    }
  }

  const deleteAgent = async (id) => {
    if (!confirm('Permanently delete this agent? This cannot be undone.')) return
    await axios.delete(`${API}/agents/${id}`)
    loadAgents()
  }

  const toggleStatus = async (agent) => {
    const action = agent.status === 'active' ? 'deactivate' : 'activate'
    await axios.post(`${API}/agents/${agent.id}/${action}`)
    loadAgents()
  }

  const viewStats = async (agent) => {
    setSelectedAgent(agent)
    const res = await axios.get(`${API}/agents/${agent.id}/stats`)
    setStats(res.data)
  }

  if (loading) return <div className="text-center py-10 text-text-gray">Loading...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-navy">Agent Management</h2>
        <button onClick={openCreate} className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium">
          + Add Agent
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, extension, or email..."
          className="w-full md:w-80 border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-bg-light">
            <tr>
              <th className="px-4 py-3 font-medium text-text-gray">Name</th>
              <th className="px-4 py-3 font-medium text-text-gray">Extension</th>
              <th className="px-4 py-3 font-medium text-text-gray">Email</th>
              <th className="px-4 py-3 font-medium text-text-gray">Categories</th>
              <th className="px-4 py-3 font-medium text-text-gray">Weight</th>
              <th className="px-4 py-3 font-medium text-text-gray">Status</th>
              <th className="px-4 py-3 font-medium text-text-gray">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} className="border-t border-border hover:bg-bg-light/50">
                <td className="px-4 py-3 font-medium">{agent.name}</td>
                <td className="px-4 py-3 text-text-gray">{agent.extension}</td>
                <td className="px-4 py-3 text-text-muted">{agent.email || '-'}</td>
                <td className="px-4 py-3">
                  {agent.categories?.length > 0
                    ? agent.categories.map(c => (
                        <span key={c.id} className="inline-block bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full mr-1">{c.name}</span>
                      ))
                    : <span className="text-text-muted">None</span>
                  }
                </td>
                <td className="px-4 py-3">{agent.default_weight}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleStatus(agent)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      agent.status === 'active'
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {agent.status === 'active' ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => viewStats(agent)} className="text-blue-600 hover:underline text-xs">Stats</button>
                  <button onClick={() => openEdit(agent)} className="text-primary hover:underline text-xs">Edit</button>
                  <button onClick={() => deleteAgent(agent.id)} className="text-danger hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-text-muted">No agents found.</td></tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* Stats Modal */}
      {stats && selectedAgent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[95vw] sm:w-96 max-h-[85vh] overflow-y-auto shadow-xl">
            <h3 className="text-lg font-heading font-bold text-navy mb-4">Stats: {selectedAgent.name}</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-text-gray">Total Calls</span><span className="font-bold">{stats.total_calls}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-gray">Repeat Calls</span><span className="font-bold text-accent">{stats.repeat_calls}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-gray">Avg Duration</span><span className="font-bold">{stats.avg_duration}s</span></div>
            </div>
            <button onClick={() => { setStats(null); setSelectedAgent(null) }} className="mt-4 w-full bg-bg-light py-2 rounded-lg hover:bg-border transition text-sm">Close</button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[95vw] sm:w-96 max-h-[85vh] overflow-y-auto shadow-xl">
            <h3 className="text-lg font-heading font-bold text-navy mb-4">{editAgent ? 'Edit Agent' : 'Add Agent'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Name</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Extension</label>
                <input type="text" value={form.extension} onChange={e => setForm({...form, extension: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" disabled={!!editAgent} />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Default Weight</label>
                <input type="number" value={form.default_weight} onChange={e => setForm({...form, default_weight: parseInt(e.target.value)})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-bg-light py-2 rounded-lg hover:bg-border transition text-sm">Cancel</button>
              <button onClick={saveAgent} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Agents
