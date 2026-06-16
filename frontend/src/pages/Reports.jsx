import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const API = '/api/v1'
const COLORS = ['#00d084', '#1a3446', '#ff6900', '#ff1818', '#6366f1', '#06b6d4']
const TIME_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom' },
]

function Reports() {
  const { token } = useAuth()
  const [summary, setSummary] = useState(null)
  const [agentStats, setAgentStats] = useState([])
  const [catStats, setCatStats] = useState([])
  const [didStats, setDidStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('last_30_days')
  const [activeView, setActiveView] = useState('agents')
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({ agent_id: '', category_id: '', did_id: '', start: '', end: '' })
  const [appliedFilters, setAppliedFilters] = useState({ ...filters })
  const [agents, setAgents] = useState([])
  const [categories, setCategories] = useState([])
  const [dids, setDids] = useState([])

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    accept: 'application/json',
  })

  const buildParams = () => {
    const params = new URLSearchParams()
    if (preset) params.set('preset', preset)
    if (appliedFilters.agent_id) params.set('agent_id', appliedFilters.agent_id)
    if (appliedFilters.category_id) params.set('category_id', appliedFilters.category_id)
    if (appliedFilters.did_id) params.set('did_id', appliedFilters.did_id)
    if (preset === 'custom') {
      if (appliedFilters.start) params.set('custom_start', appliedFilters.start)
      if (appliedFilters.end) params.set('custom_end', appliedFilters.end)
    }
    return params.toString()
  }

  const loadOptions = async () => {
    const headers = authHeaders()
    const [{ data: agentsList }, { data: categoriesList }, { data: didsList }] = await Promise.all([
      axios.get(`${API}/agents/`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/categories/`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/reports/dids/?preset=last_30_days`, { headers }).catch(() => ({ data: [] })),
    ])
    setAgents(Array.isArray(agentsList) ? agentsList : [])
    setCategories(Array.isArray(categoriesList) ? categoriesList : [])
    setDids(Array.isArray(didsList) ? didsList : [])
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const headers = authHeaders()
      const qs = buildParams()
      const [s, a, c, d] = await Promise.all([
        axios.get(`${API}/reports/summary/?${qs}`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/reports/agents/summary/?${qs}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/reports/categories/?${qs}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/reports/dids/?${qs}`, { headers }).catch(() => ({ data: [] })),
      ])
      const nextSummary = (s.data && typeof s.data === 'object') ? {
        total_calls: Number(s.data.total_calls ?? 0) || 0,
        total_callers: Number(s.data.total_callers ?? 0) || 0,
        repeat_callers: Number(s.data.repeat_callers ?? 0) || 0,
        repeat_rate: Number(s.data.repeat_rate ?? 0) || 0,
        blocked_calls: Number(s.data.blocked_calls ?? 0) || 0,
        total_agents: Number(s.data.total_agents ?? 0) || 0,
        total_categories: Number(s.data.total_categories ?? 0) || 0,
        total_dids: Number(s.data.total_dids ?? 0) || 0,
        avg_call_duration: Number(s.data.avg_call_duration ?? 0) || 0,
      } : summary
      setSummary(nextSummary)
      const normalizeStats = (list = []) => list.map((item) => ({
        ...item,
        total_calls: Number(item.total_calls ?? 0) || 0,
        repeat_calls: Number(item.repeat_calls ?? 0) || 0,
        repeat_rate: Number(item.repeat_rate ?? 0) || 0,
        unique_callers: Number(item.unique_callers ?? 0) || 0,
        today_calls: Number(item.today_calls ?? 0) || 0,
        avg_duration: Number(item.avg_duration ?? 0) || 0,
      }))
      setAgentStats(normalizeStats(Array.isArray(a.data) ? a.data : []))
      setCatStats(normalizeStats(Array.isArray(c.data) ? c.data : []))
      setDidStats(normalizeStats(Array.isArray(d.data) ? d.data : []))
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { loadOptions() }, [token])
  useEffect(() => { loadData() }, [preset, appliedFilters])

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }))

  const applyFilters = () => setAppliedFilters({ ...filters })

  const exportFile = async (format) => {
    setExporting(true)
    try {
      const qs = buildParams()
      const res = await axios.get(`${API}/reports/export/?${qs}&format=${format}`, { responseType: 'blob', headers: authHeaders() })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `report.${format}`
      link.click()
    } catch (e) { alert('Export failed') }
    setExporting(false)
  }

  if (loading && !summary) {
    return <div className="text-center py-10 text-text-gray">Loading reports...</div>
  }
  if (!summary) {
    return <div className="text-center py-10 text-text-gray">No report data available yet.</div>
  }

  const agentChartData = agentStats.map(a => ({ name: a.agent_name || '-', calls: a.total_calls, repeat: a.repeat_calls }))
  const catChartData = catStats.map(c => ({ name: c.category_name || 'Unnamed', calls: c.total_calls }))
  const didChartData = didStats.map(d => ({ name: d.did_number, calls: d.total_calls }))

  const views = [
    { key: 'agents', label: 'By Agent' },
    { key: 'categories', label: 'By Category' },
    { key: 'dids', label: 'By DID' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">Reports & Analytics</h2>
          <p className="text-sm text-text-gray mt-1">Filtered call analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={preset} onChange={e => setPreset(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none">
            {TIME_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => exportFile('csv')} disabled={exporting} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">CSV</button>
          <button onClick={() => exportFile('pdf')} disabled={exporting} className="bg-danger text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">PDF</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">Agent</label>
            <select value={filters.agent_id} onChange={e => updateFilter('agent_id', e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.extension})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">Category</label>
            <select value={filters.category_id} onChange={e => updateFilter('category_id', e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">DID</label>
            <select value={filters.did_id} onChange={e => updateFilter('did_id', e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="">All DIDs</option>
              {dids.map(d => <option key={d.did_id} value={d.did_id}>{d.did_number} ({d.category_name})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">From</label>
            <input type="datetime-local" value={filters.start} onChange={e => updateFilter('start', e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">To</label>
            <input type="datetime-local" value={filters.end} onChange={e => updateFilter('end', e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={applyFilters} className="bg-navy text-white px-4 py-2 rounded-lg text-sm hover:bg-navy/90">Apply Filters</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total Calls', value: summary.total_calls, color: 'bg-primary' },
          { label: 'Unique Callers', value: summary.total_callers, color: 'bg-blue-500' },
          { label: 'Repeat', value: summary.repeat_callers, color: 'bg-accent' },
          { label: 'Blocked', value: summary.blocked_calls, color: 'bg-danger' },
          { label: 'Agents', value: summary.total_agents, color: 'bg-navy' },
          { label: 'Categories', value: summary.total_categories, color: 'bg-purple-500' },
        ].map((card, i) => (
          <div key={i} className={`${card.color} text-white rounded-xl p-4 shadow-sm`}>
            <div className="text-xs opacity-80">{card.label}</div>
            <div className="text-2xl font-heading font-bold mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div className="flex border-b border-border mb-6">
        {views.map(v => (
          <button key={v.key} onClick={() => setActiveView(v.key)} className={`px-6 py-3 text-sm font-medium transition ${activeView === v.key ? 'border-b-2 border-primary text-primary' : 'text-text-gray'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-border p-6">
          <h3 className="text-sm font-heading font-semibold text-navy mb-4">
            {activeView === 'agents' ? 'Calls by Agent' : activeView === 'categories' ? 'Calls by Category' : 'Calls by DID'}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activeView === 'agents' ? agentChartData : activeView === 'categories' ? catChartData : didChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="calls" fill="#00d084" name="Calls" radius={[4, 4, 0, 0]} />
              {activeView === 'agents' && <Bar dataKey="repeat" fill="#ff6900" name="Repeat" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-border p-6">
          <h3 className="text-sm font-heading font-semibold text-navy mb-4">Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={activeView === 'categories' ? catChartData : agentChartData} cx="50%" cy="50%" outerRadius={100} dataKey="calls" label={({ name, value }) => `${name}: ${value}`}>
                {(activeView === 'categories' ? catChartData : agentChartData).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-text-gray">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats Tables */}
      {activeView === 'agents' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="px-4 py-3 bg-bg-light font-heading font-semibold text-sm text-navy">Agent Performance</div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-t border-border">
              <th className="px-4 py-2 text-text-gray font-medium">Agent</th>
              <th className="px-4 py-2 text-text-gray font-medium">Ext</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Calls</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Repeat</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Avg Duration</th>
            </tr></thead>
            <tbody>
              {agentStats.map(a => (
                <tr key={a.agent_id} className="border-t border-border hover:bg-bg-light/50">
                  <td className="px-4 py-2 font-medium">{a.agent_name}</td>
                  <td className="px-4 py-2 text-text-gray">{a.extension}</td>
                  <td className="px-4 py-2 text-right">{a.total_calls}</td>
                  <td className="px-4 py-2 text-right text-accent">{a.repeat_calls}</td>
                  <td className="px-4 py-2 text-right">{a.avg_duration}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'categories' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="px-4 py-3 bg-bg-light font-heading font-semibold text-sm text-navy">Category Performance</div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-t border-border">
              <th className="px-4 py-2 text-text-gray font-medium">Category</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Calls</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Callers</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Repeat Rate</th>
            </tr></thead>
            <tbody>
              {catStats.map(c => (
                <tr key={c.category_id} className="border-t border-border hover:bg-bg-light/50">
                  <td className="px-4 py-2 font-medium">{c.category_name}</td>
                  <td className="px-4 py-2 text-right">{c.total_calls}</td>
                  <td className="px-4 py-2 text-right">{c.unique_callers}</td>
                  <td className="px-4 py-2 text-right text-primary font-medium">{c.repeat_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'dids' && (
        <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="px-4 py-3 bg-bg-light font-heading font-semibold text-sm text-navy">DID Performance</div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-t border-border">
              <th className="px-4 py-2 text-text-gray font-medium">DID</th>
              <th className="px-4 py-2 text-text-gray font-medium">Category</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Calls</th>
              <th className="px-4 py-2 text-text-gray font-medium text-right">Callers</th>
            </tr></thead>
            <tbody>
              {didStats.map(d => (
                <tr key={d.did_id} className="border-t border-border hover:bg-bg-light/50">
                  <td className="px-4 py-2 font-medium">{d.did_number}</td>
                  <td className="px-4 py-2 text-text-gray">{d.category_name}</td>
                  <td className="px-4 py-2 text-right">{d.total_calls}</td>
                  <td className="px-4 py-2 text-right">{d.unique_callers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Reports
