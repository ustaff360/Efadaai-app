import React, { useEffect, useState } from 'react'
import axios from 'axios'

const API = '/api/v1'
const ROUTING_STRATEGIES = [
  { value: 'weighted', label: 'Weighted Random' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'sequential', label: 'Sequential' },
]

function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', customer_name: '', contact_number: '', owner_email: '', locations: [] })

  // Inline DID management in form
  const [formDids, setFormDids] = useState([])
  const [newDid, setNewDid] = useState({ did_number: '', description: '' })
  const [editDid, setEditDid] = useState(null)

  // Inline Agent selection in form
  const [allAgents, setAllAgents] = useState([])
  const [selectedAgents, setSelectedAgents] = useState([]) // [{agent_id, routing_strategy, override_weight}]

  const loadCategories = async () => {
    try {
      const res = await axios.get(`${API}/categories/`)
      setCategories(res.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadCategories() }, [])

  const openCreate = async () => {
    setEditCat(null)
    setForm({ name: '', description: '', customer_name: '', contact_number: '', owner_email: '', locations: [] })
    setFormDids([])
    setNewDid({ did_number: '', description: '' })
    setEditDid(null)
    setSelectedAgents([])
    try {
      const res = await axios.get(`${API}/agents/`)
      setAllAgents(res.data)
    } catch (e) { setAllAgents([]) }
    setShowForm(true)
  }

  const openEdit = async (cat) => {
    setEditCat(cat)
    setForm({ name: cat.name, description: cat.description || '', customer_name: cat.customer_name || '', contact_number: cat.contact_number || '', owner_email: cat.owner_email || '', locations: cat.locations || [] })
    setNewDid({ did_number: '', description: '' })
    setEditDid(null)
    try {
      const [agentsRes, didsRes, catAgentsRes] = await Promise.all([
        axios.get(`${API}/agents/`),
        axios.get(`${API}/categories/${cat.id}/dids`),
        axios.get(`${API}/categories/${cat.id}/agents`)
      ])
      setAllAgents(agentsRes.data)
      setFormDids(didsRes.data)
      setSelectedAgents(catAgentsRes.data.map(ca => ({
        id: ca.id,
        agent_id: ca.agent_id,
        agent_name: ca.agent_name,
        agent_extension: ca.agent_extension,
        routing_strategy: ca.routing_strategy,
        override_weight: ca.override_weight || '',
        active: ca.active
      })))
    } catch (e) {
      setAllAgents([])
      setFormDids([])
      setSelectedAgents([])
    }
    setShowForm(true)
  }

  const saveCategory = async () => {
    try {
      let catId
      if (editCat) {
        await axios.put(`${API}/categories/${editCat.id}/`, form)
        catId = editCat.id
      } else {
        const res = await axios.post(`${API}/categories/`, form)
        catId = res.data.id
      }

      // Save new DIDs
      for (const did of formDids) {
        if (!did.id) {
          await axios.post(`${API}/categories/${catId}/dids`, { did_number: did.did_number, description: did.description })
        }
      }

      // Save agent assignments (only new ones without id)
      for (const sa of selectedAgents) {
        if (!sa.id) {
          const data = { agent_id: sa.agent_id, routing_strategy: sa.routing_strategy }
          if (sa.override_weight) data.override_weight = parseInt(sa.override_weight)
          await axios.post(`${API}/categories/${catId}/agents`, data)
        }
      }

      setShowForm(false)
      loadCategories()
    } catch (e) { alert(e.response?.data?.detail || 'Error') }
  }

  const toggleStatus = async (cat) => {
    const action = cat.status === 'active' ? 'deactivate' : 'activate'
    await axios.post(`${API}/categories/${cat.id}/${action}`)
    loadCategories()
  }

  const deleteCategory = async (id) => {
    if (!confirm('Permanently delete this category?')) return
    await axios.delete(`${API}/categories/${id}/`)
    loadCategories()
  }

  // DID helpers (inline in form)
  const addDidToForm = () => {
    if (!newDid.did_number.trim()) return
    setFormDids([...formDids, { ...newDid, _tempId: Date.now() }])
    setNewDid({ did_number: '', description: '' })
  }

  const updateDidInForm = (index) => {
    if (!newDid.did_number.trim()) return
    const updated = [...formDids]
    updated[index] = { ...updated[index], did_number: newDid.did_number, description: newDid.description }
    setFormDids(updated)
    setEditDid(null)
    setNewDid({ did_number: '', description: '' })
  }

  const removeDidFromForm = async (index) => {
    const did = formDids[index]
    if (did.id && editCat) {
      if (!confirm('Remove this DID?')) return
      await axios.delete(`${API}/categories/${editCat.id}/dids/${did.id}`)
    }
    setFormDids(formDids.filter((_, i) => i !== index))
  }

  const startEditDid = (did, index) => {
    setEditDid(index)
    setNewDid({ did_number: did.did_number, description: did.description || '' })
  }

  // Agent helpers (inline in form)
  const toggleAgentSelection = (agent) => {
    const idx = selectedAgents.findIndex(sa => sa.agent_id === agent.id)
    if (idx >= 0) {
      // Remove
      if (selectedAgents[idx].id && editCat) {
        if (!confirm('Remove agent from category?')) return
        axios.delete(`${API}/categories/${editCat.id}/agents/${selectedAgents[idx].id}`)
      }
      setSelectedAgents(selectedAgents.filter((_, i) => i !== idx))
    } else {
      // Add
      setSelectedAgents([...selectedAgents, {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_extension: agent.extension,
        routing_strategy: 'weighted',
        override_weight: '',
      }])
    }
  }

  const updateAgentStrategy = (agentId, field, value) => {
    setSelectedAgents(selectedAgents.map(sa =>
      sa.agent_id === agentId ? { ...sa, [field]: value } : sa
    ))
  }

  const isAgentSelected = (agentId) => selectedAgents.some(sa => sa.agent_id === agentId)

  if (loading) return <div className="text-center py-10 text-text-gray">Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-navy">Category Management</h2>
        <button onClick={openCreate} className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium">
          + Add Category
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[700px]">
          <thead className="bg-bg-light">
            <tr>
              <th className="px-4 py-3 font-medium text-text-gray">Name</th>
              <th className="px-4 py-3 font-medium text-text-gray">Customer</th>
              <th className="px-4 py-3 font-medium text-text-gray">Contact</th>
              <th className="px-4 py-3 font-medium text-text-gray">Email</th>
              <th className="px-4 py-3 font-medium text-text-gray">Status</th>
              <th className="px-4 py-3 font-medium text-text-gray">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} className="border-t border-border hover:bg-bg-light/50">
                <td className="px-4 py-3 font-medium">{cat.name}</td>
                <td className="px-4 py-3 text-text-gray">{cat.customer_name || '-'}</td>
                <td className="px-4 py-3 text-text-gray">{cat.contact_number || '-'}</td>
                <td className="px-4 py-3 text-text-muted">{cat.owner_email || '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleStatus(cat)} className={`px-3 py-1 rounded-full text-xs font-medium transition ${cat.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                    {cat.status === 'active' ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(cat)} className="text-navy hover:underline text-xs">Edit</button>
                  <button onClick={() => deleteCategory(cat.id)} className="text-danger hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan="6" className="text-center py-8 text-text-muted">No categories yet. Click "+ Add Category" to create one.</td></tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* Unified Category Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto py-6">
          <div className="bg-white rounded-xl p-6 w-[95vw] sm:w-[600px] max-w-[600px] shadow-xl my-auto">
            <h3 className="text-lg font-heading font-bold text-navy mb-4">
              {editCat ? 'Edit Category' : 'Add Category'}
            </h3>

            {/* Section 1: Basic Info */}
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-navy mb-3 border-b border-border pb-2">Basic Information</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Customer Name</label>
                  <input type="text" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Category / Services</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Contact Number</label>
                    <input type="text" value={form.contact_number} onChange={e => setForm({...form, contact_number: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Email</label>
                    <input type="email" value={form.owner_email} onChange={e => setForm({...form, owner_email: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Description</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" rows="2" />
                </div>
              </div>
            </div>

            {/* Section 2: DIDs */}
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-navy mb-3 border-b border-border pb-2">DIDs (Phone Numbers)</h4>
              <div className="flex gap-2 mb-3">
                <input type="text" value={newDid.did_number} onChange={e => setNewDid({...newDid, did_number: e.target.value})} className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" placeholder="+155****4567" />
                <input type="text" value={newDid.description} onChange={e => setNewDid({...newDid, description: e.target.value})} className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" placeholder="Description" />
                <button onClick={() => editDid !== null ? updateDidInForm(editDid) : addDidToForm()} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-dark whitespace-nowrap">
                  {editDid !== null ? 'Update' : '+ Add'}
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {formDids.map((did, i) => (
                  <div key={did.id || did._tempId || i} className="flex justify-between items-center bg-bg-light px-3 py-2 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{did.did_number}</span>
                      {did.description && <span className="text-text-muted ml-2 text-xs">({did.description})</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditDid(did, i)} className="text-primary hover:underline text-xs">Edit</button>
                      <button onClick={() => removeDidFromForm(i)} className="text-danger hover:underline text-xs">Remove</button>
                    </div>
                  </div>
                ))}
                {formDids.length === 0 && <p className="text-text-muted text-center py-2 text-xs">No DIDs added yet.</p>}
              </div>
            </div>

            {/* Section 3: Agent Assignment */}
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-navy mb-3 border-b border-border pb-2">Assign Agents</h4>
              {allAgents.length === 0 ? (
                <p className="text-text-muted text-sm py-2">No agents available. <a href="/agents" className="text-primary underline">Create agents first.</a></p>
              ) : (
                <div className="space-y-2">
                  {allAgents.map(agent => {
                    const selected = isAgentSelected(agent.id)
                    const sa = selectedAgents.find(s => s.agent_id === agent.id)
                    return (
                      <div key={agent.id} className={`border rounded-lg p-3 transition ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selected} onChange={() => toggleAgentSelection(agent)} className="w-4 h-4 accent-primary" />
                          <div className="flex-1">
                            <span className="font-medium text-sm">{agent.extension}</span>
                            <span className="text-text-gray ml-2 text-sm">{agent.name}</span>
                          </div>
                        </div>
                        {selected && sa && (
                          <div className="flex gap-2 mt-2 ml-7">
                            <select value={sa.routing_strategy} onChange={e => updateAgentStrategy(agent.id, 'routing_strategy', e.target.value)} className="border border-border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary focus:outline-none">
                              {ROUTING_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <input type="number" value={sa.override_weight} onChange={e => updateAgentStrategy(agent.id, 'override_weight', e.target.value)} className="w-20 border border-border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary focus:outline-none" placeholder="Weight" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowForm(false); setEditDid(null); setNewDid({ did_number: '', description: '' }) }} className="flex-1 bg-bg-light py-2 rounded-lg hover:bg-border transition text-sm">Cancel</button>
              <button onClick={saveCategory} className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium">
                {editCat ? 'Update Category' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Categories
