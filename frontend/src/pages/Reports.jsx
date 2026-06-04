import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const API = '/api/v1'
const COLORS = ['#00d084', '#1a3446', '#ff6900', '#ff1818', '#6366f1', '#06b6d4']
const TIME_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
]

function Reports() {
  const [summary, setSummary] = useState(null)
  const [agentStats, setAgentStats] = useState([])
  const [catStats, setCatStats] = useState([])
  const [didStats, setDidStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('last_30_days')
  const [activeView, setActiveView] = useState('agents')
  const [exporting, setExporting] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, a, c, d] = await Promise.all([
        axios.get(`${API}/reports/summary/?preset=${preset}`),
        axios.get(`${API}/reports/agents/?preset=${preset}`),
        axios.get(`${API}/reports/categories/?preset=${preset}`),
        axios.get(`${API}/reports/dids/?preset=${preset}`),
      ])
      setSummary(s.data)
      setAgentStats(a.data)
      setCatStats(c.data)
      setDidStats(d.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [preset])

  const exportFile = async (format) => {
    setExporting(true)
    try {
      const res = await axios.get(`${API}/reports/export/?format=${format}&preset=${preset}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `report_${preset}.${format}`
      link.click()
    } catch (e) { alert('Export failed') }
    setExporting(false)
  }

  if (loading || !summary) return <div className="text-center py-10 text-text-gray">Loading...</div>

  const agentChartData = agentStats.map(a => ({ name: a.agent_name, calls: a.total_calls, repeat: a.repeat_calls }))
  const catChartData = catStats.map(c => ({ name: c.category_name, value: c.total_calls }))
  const didChartData = didStats.map(d => ({ name: d.did_number, calls: d.total_calls }))

  const views = [
    { key: 'agents', label: 'By Agent' },
    { key: 'categories', label: 'By Category' },
    { key: 'dids', label: 'By DID' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-navy">Reports & Analytics</h2>
        <div className="flex gap-3">
          <select value={preset} onChange={e => setPreset(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
            {TIME_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => exportFile('csv')} disabled={exporting} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">CSV</button>
          <button onClick={() => exportFile('pdf')} disabled={exporting} className="bg-danger text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">PDF</button>
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
              <Pie data={activeView === 'categories' ? catChartData : agentChartData} cx="50%" cy="50%" outerRadius={100} dataKey={activeView === 'categories' ? 'value' : 'calls'} label={({ name, value }) => `${name}: ${value}`}>
                {(activeView === 'categories' ? catChartData : agentChartData).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
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
