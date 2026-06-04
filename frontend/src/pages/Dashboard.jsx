import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const API = '/api/v1'
const COLORS = ['#00d084', '#1a3446', '#ff6900', '#ff1818', '#6366f1', '#06b6d4']

const TIME_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
]

function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [agentStats, setAgentStats] = useState([])
  const [catStats, setCatStats] = useState([])
  const [didStats, setDidStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('last_30_days')
  const [activeTab, setActiveTab] = useState('agents')
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

  if (loading || !summary) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-text-gray text-sm">Loading dashboard...</div>
    </div>
  )

  const cards = [
    { label: 'Total Calls', value: summary.total_calls, accent: 'border-l-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
    )},
    { label: 'Unique Callers', value: summary.total_callers, accent: 'border-l-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
    )},
    { label: 'Repeat Callers', value: summary.repeat_callers, accent: 'border-l-orange-500', iconBg: 'bg-orange-50', iconColor: 'text-orange-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
    )},
    { label: 'Blocked', value: summary.blocked_calls, accent: 'border-l-red-500', iconBg: 'bg-red-50', iconColor: 'text-red-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
    )},
    { label: 'Active Agents', value: summary.total_agents, accent: 'border-l-slate-500', iconBg: 'bg-slate-50', iconColor: 'text-slate-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
    )},
    { label: 'Categories', value: summary.total_categories, accent: 'border-l-purple-500', iconBg: 'bg-purple-50', iconColor: 'text-purple-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
    )},
  ]

  const tabs = [
    { key: 'agents', label: 'Agents', count: agentStats.length },
    { key: 'categories', label: 'Categories', count: catStats.length },
  ]

  const agentChartData = agentStats.map(a => ({ name: a.agent_name, calls: a.total_calls, repeat: a.repeat_calls }))
  const catChartData = catStats.map(c => ({ name: c.category_name, value: c.total_calls }))

  const getChartData = () => {
    if (activeTab === 'agents') return agentChartData
    if (activeTab === 'categories') return catChartData
    return agentChartData
  }

  const getPresetLabel = () => TIME_PRESETS.find(p => p.value === preset)?.label || preset

  const formatDuration = (sec) => {
    if (!sec) return '0s'
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">Dashboard</h2>
          <p className="text-sm text-text-gray mt-1">
            Showing <span className="font-medium text-text-dark">{getPresetLabel()}</span> data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={e => setPreset(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none"
          >
            {TIME_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button
            onClick={() => exportFile('csv')}
            disabled={exporting}
            className="flex items-center gap-1.5 bg-white border border-border text-text-dark px-3 py-2 rounded-lg text-sm hover:bg-bg-light disabled:opacity-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            CSV
          </button>
          <button
            onClick={() => exportFile('pdf')}
            disabled={exporting}
            className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`bg-white rounded-xl border border-border border-l-4 ${card.accent} p-4 shadow-sm hover:shadow-md transition`}
          >
            <div className={`w-9 h-9 ${card.iconBg} rounded-lg flex items-center justify-center ${card.iconColor} mb-3`}>
              {card.icon}
            </div>
            <div className="text-xs text-text-gray font-medium uppercase tracking-wide">{card.label}</div>
            <div className="text-2xl font-heading font-bold text-text-dark mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Charts + Quick Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Bar Chart - spans 2 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-heading font-semibold text-navy">
              {activeTab === 'agents' ? 'Calls by Agent' : 'Calls by Category'}
            </h3>
            <span className="text-xs text-text-muted">{getPresetLabel()}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={getChartData()} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={50} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="calls" fill="#00d084" name="Calls" radius={[4, 4, 0, 0]} />
              {activeTab === 'agents' && <Bar dataKey="repeat" fill="#ff6900" name="Repeat" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-heading font-semibold text-navy">Distribution</h3>
            <span className="text-xs text-text-muted">by {activeTab}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={getChartData()}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
                dataKey={activeTab === 'categories' ? 'value' : 'calls'}
                paddingAngle={2}
              >
                {getChartData().map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span className="text-xs text-text-gray">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Tables */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        {/* Tab Header */}
        <div className="flex overflow-x-auto border-b border-border bg-bg-light/30">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                activeTab === tab.key
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-text-gray hover:text-text-dark hover:bg-white/50'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs text-text-muted">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="overflow-x-auto">
          {activeTab === 'agents' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-text-gray border-b border-border">
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Extension</th>
                  <th className="px-5 py-3 font-medium text-right">Total Calls</th>
                  <th className="px-5 py-3 font-medium text-right">Repeat</th>
                  <th className="px-5 py-3 font-medium text-right">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a, i) => (
                  <tr key={a.agent_id} className="border-b border-border last:border-0 hover:bg-bg-light/50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center text-primary text-xs font-bold">
                          {a.agent_name[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{a.agent_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-gray font-mono text-xs">{a.extension}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy">{a.total_calls}</td>
                    <td className="px-5 py-3 text-right">
                      {a.repeat_calls > 0
                        ? <span className="text-orange-600 font-medium">{a.repeat_calls}</span>
                        : <span className="text-text-muted">0</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-right text-text-gray">{formatDuration(a.avg_duration)}</td>
                  </tr>
                ))}
                {agentStats.length === 0 && (
                  <tr><td colSpan="5" className="px-5 py-10 text-center text-text-muted">No agent data for this period</td></tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'categories' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-text-gray border-b border-border">
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">DIDs</th>
                  <th className="px-5 py-3 font-medium text-right">Total Calls</th>
                  <th className="px-5 py-3 font-medium text-right">Unique Callers</th>
                  <th className="px-5 py-3 font-medium text-right">Repeat Rate</th>
                </tr>
              </thead>
              <tbody>
                {catStats.map(c => {
  // Find DIDs belonging to this category
                  const catDids = didStats.filter(d => d.category_name === c.category_name)
                  return (
                    <tr key={c.category_id} className="border-b border-border last:border-0 hover:bg-bg-light/50 transition">
                      <td className="px-5 py-3 font-medium">{c.category_name}</td>
                      <td className="px-5 py-3">
                        {catDids.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {catDids.map(d => (
                              <span key={d.did_id} className="inline-block bg-navy/10 text-navy text-xs px-2 py-0.5 rounded font-mono">
                                {d.did_number}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-muted text-xs">No DIDs</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-navy">{c.total_calls}</td>
                      <td className="px-5 py-3 text-right text-text-gray">{c.unique_callers}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {c.repeat_rate}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {catStats.length === 0 && (
                  <tr><td colSpan="5" className="px-5 py-10 text-center text-text-muted">No category data for this period</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
