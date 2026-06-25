import React, { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Phone, Users, Repeat, Shield, UserCheck, Layers } from 'lucide-react'

const API = '/api/v1'
const COLORS = ['#00d084', '#1a3446', '#ff6900', '#ff1818', '#6366f1', '#06b6d4']

function Dashboard() {
  const { token } = useAuth()
  const [summary, setSummary] = useState({
    total_calls: 0, total_callers: 0, repeat_callers: 0, repeat_rate: 0,
    blocked_calls: 0, total_agents: 0, total_categories: 0, total_dids: 0, avg_call_duration: 0,
  })
  const [agentStats, setAgentStats] = useState([])
  const [catStats, setCatStats] = useState([])
  const [didStats, setDidStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('agents')
  const [preset, setPreset] = useState('last_30_days')
  const [liveCall, setLiveCall] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
      }
      const [s, a, c, d] = await Promise.all([
        axios.get(`${API}/reports/summary/?preset=${preset}`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/reports/agents/summary/?preset=${preset}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/reports/categories/?preset=${preset}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/reports/dids/?preset=${preset}`, { headers }).catch(() => ({ data: [] })),
      ])
      setSummary(s.data || summary)
      setAgentStats(Array.isArray(a.data) ? a.data : [])
      setCatStats(Array.isArray(c.data) ? c.data : [])
      setDidStats(Array.isArray(d.data) ? d.data : [])
    } catch (e) {
      console.error('Dashboard load error', e)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [preset, token])

  // WebSocket for live call events
  useEffect(() => {
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/dashboard/`

    let ws
    let reconnectTimeoutRef = { current: null }

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('Dashboard WebSocket connected')
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            const evt = data?.event || data?.type
            if (evt === 'NEW_CALL_ROUTED' || evt === 'call_routed' || (data?.type === 'dashboard' && data?.call_id)) {
              const candidate = {
                id: data.call_id || data.data?.call_id || Date.now(),
                caller_id: data.caller_id || data.callerNumber || data.data?.caller_id || data.data?.callerNumber || 'Unknown',
                caller_number: data.callerNumber || data.caller_id || data.data?.caller_number || data.data?.caller_id || 'Unknown',
                did: data.did || data.didNumber || data.data?.did || data.data?.didNumber || '-',
                category: data.category || data.category_name || data.data?.category || data.data?.category_name || 'Unknown',
                agent: data.agent_name || data.agent || data.data?.agent_name || data.data?.agent || 'Unassigned',
                timestamp: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
              }
              const hasMeaningful = ['caller_number','category','agent'].some((k) => !['Unknown','Unassigned','-'].includes(candidate[k]))
              if (hasMeaningful) setLiveCall(candidate)
            }
          } catch (e) {
            console.error('WebSocket message parse error', e)
          }
        }

        ws.onclose = () => {
          console.log('Dashboard WebSocket disconnected, reconnecting...')
          reconnectTimeoutRef.current = setTimeout(connect, 3000)
        }

        ws.onerror = (err) => {
          console.error('Dashboard WebSocket error', err)
        }
      } catch (e) {
        console.error('WebSocket connect error', e)
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (ws) {
        ws.onclose = null
        ws.onerror = null
        try { ws.close() } catch (e) { /* ignore */ }
      }
    }
  }, [token])

  const dismissLiveCall = () => setLiveCall(null)

  if (loading && summary.total_calls === 0) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-text-gray text-sm">Loading dashboard...</div>
    </div>
  )

  const cards = [
    { label: 'Total Calls', value: summary.total_calls, accent: 'border-l-emerald-500', iconBg: 'bg-emerald-500', icon: Phone },
    { label: 'Unique Callers', value: summary.total_callers, accent: 'border-l-blue-500', iconBg: 'bg-blue-500', icon: Users },
    { label: 'Repeat Callers', value: summary.repeat_callers, accent: 'border-l-orange-500', iconBg: 'bg-orange-500', icon: Repeat },
    { label: 'Blocked', value: summary.blocked_calls, accent: 'border-l-red-500', iconBg: 'bg-red-500', icon: Shield },
    { label: 'Active Agents', value: summary.total_agents, accent: 'border-l-slate-500', iconBg: 'bg-slate-500', icon: UserCheck },
    { label: 'Categories', value: summary.total_categories, accent: 'border-l-purple-500', iconBg: 'bg-purple-500', icon: Layers },
  ]

  const tabs = [
    { key: 'agents', label: 'Agents', count: agentStats.length },
    { key: 'categories', label: 'Categories', count: catStats.length },
  ]

  const agentChartData = agentStats.map(a => ({ name: a.agent_name || '-', calls: a.total_calls, repeat: a.repeat_calls, today: a.today_calls || 0 }))
  const catChartData = catStats.map(c => ({ name: c.category_name || 'Unnamed', calls: c.total_calls }))

  const getChartData = () => {
    if (activeTab === 'agents') return agentChartData
    if (activeTab === 'categories') return catChartData
    return agentChartData
  }

  const formatDuration = (sec) => {
    if (!sec) return '0s'
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }

  return (
    <div>
      {/* Live Call Popup */}
      {liveCall && (
        <div className="fixed top-4 right-4 z-50 w-80 bg-white rounded-xl shadow-2xl border border-emerald-200 overflow-hidden animate-bounce-in">
          <div className="bg-emerald-500 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              <span className="text-sm font-semibold">Live Call</span>
            </div>
            <button onClick={dismissLiveCall} className="text-white/80 hover:text-white transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-gray">Caller</span>
              <span className="font-medium text-text-dark">{liveCall.caller_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-gray">DID</span>
              <span className="font-mono text-xs text-navy bg-navy/5 px-2 py-0.5 rounded">{liveCall.did}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-gray">Category</span>
              <span className="font-medium text-text-dark">{liveCall.category}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-gray">Agent</span>
              <span className="font-medium text-emerald-700">{liveCall.agent}</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-border">
              <span className="text-text-muted">{liveCall.timestamp}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">Dashboard</h2>
          <p className="text-sm text-text-gray mt-1">
            Real-time routing overview
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`bg-white rounded-xl border border-border border-l-4 ${card.accent} p-4 shadow-sm hover:shadow-md transition`}
          >
            <div className={`w-9 h-9 ${card.iconBg} rounded-lg flex items-center justify-center text-white mb-3`}>
              {card.icon ? <card.icon size={18} /> : null}
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
            <span className="text-xs text-text-muted">Last 30 Days</span>
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
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Agent</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Extension</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Total Calls</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Unique Callers</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Repeat Rate</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Today Calls</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a) => (
                  <tr key={a.agent_id} className="border-b border-border last:border-0 hover:bg-bg-light/50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center text-primary text-xs font-bold">
                          {(a.agent_name || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{a.agent_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-gray font-mono text-xs">{a.extension}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy">{a.total_calls}</td>
                    <td className="px-5 py-3 text-right text-text-gray">{a.unique_callers}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                        {a.repeat_rate}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-text-gray">{Number(a.today_calls ?? 0) || 0}</td>
                    <td className="px-5 py-3 text-right text-text-gray">{formatDuration(a.avg_duration)}</td>
                  </tr>
                ))}
                {agentStats.length === 0 && (
                  <tr><td colSpan="7" className="px-5 py-10 text-center text-text-muted">No agent data for this period</td></tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'categories' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-text-gray border-b border-border">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">DIDs</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Total Calls</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Unique Callers</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Total Agents</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Repeat Rate</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Today Calls</th>
                </tr>
              </thead>
              <tbody>
              {catStats.map(c => {
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
                       {c.total_agents}
                     </span>
                   </td>
                   <td className="px-5 py-3 text-right">
                     <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                       {c.repeat_rate}%
                     </span>
                   </td>
                   <td className="px-5 py-3 text-right text-text-gray">{Number(c.today_calls ?? 0) || 0}</td>
                 </tr>
               )
              })}
              {catStats.length === 0 && (
               <tr><td colSpan="8" className="px-5 py-10 text-center text-text-muted">No category data for this period</td></tr>
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
