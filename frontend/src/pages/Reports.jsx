import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Phone, Users, Repeat, Shield,
  UserCheck, Layers, Download, RefreshCw, Filter,
  Activity, AlertTriangle,
} from 'lucide-react'

const API = '/api/v1'
const PIE_COLORS = ['#3B8CFF', '#00C88A', '#F5A623', '#E53317', '#6366f1', '#06b6d4', '#f472b6']
const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
]

// ─── Helpers ───────────────────────────────────────────────────────────
const formatNum = (n) => Number(n ?? 0).toLocaleString()
const fmtDuration = (s) => {
  if (!s || s === 0) return '0s'
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function SkeletonBar({ w = 'w-24' }) {
  return <div className={`h-4 ${w} bg-gray-200 rounded animate-pulse`} />
}

function Row({ label, value, color, bold, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, paddingTop: 4, paddingBottom: 4 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 400, fontFamily: mono ? 'monospace' : 'inherit', color: color || '#0F172A' }}>{value ?? '—'}</span>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, color, subtitle }) {
  const accentMap = {
    blue: { border: 'border-l-blue-500', icon: 'bg-blue-500', text: 'text-blue-600' },
    green: { border: 'border-l-green-500', icon: 'bg-green-500', text: 'text-green-600' },
    amber: { border: 'border-l-amber-500', icon: 'bg-amber-500', text: 'text-amber-600' },
    red: { border: 'border-l-red-500', icon: 'bg-red-500', text: 'text-red-600' },
    navy: { border: 'border-l-slate-500', icon: 'bg-slate-500', text: 'text-slate-600' },
    purple: { border: 'border-l-purple-500', icon: 'bg-purple-500', text: 'text-purple-600' },
  }
  const a = accentMap[color] || accentMap.blue

  return (
    <div className={`bg-white rounded-xl border border-border border-l-4 ${a.border} p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</p>
          <p className="text-2xl font-bold text-navy tracking-tight">{value != null ? formatNum(value) : <SkeletonBar w="w-16" />}</p>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${a.icon} text-white flex items-center justify-center`}>
          {Icon && <Icon size={18} />}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <div className="p-4 rounded-full bg-gray-100 text-gray-400 mb-4"><Icon size={32} /></div>}
      <h3 className="text-sm font-semibold text-gray-600">{title || 'No data available'}</h3>
      <p className="text-xs text-gray-400 mt-1 max-w-xs">{message || 'Data will appear once calls start routing.'}</p>
    </div>
  )
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      Live
    </div>
  )
}

function ExportButton({ onExport, format, loading }) {
  return (
    <button
      onClick={() => onExport(format)}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 
        bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
    >
      {loading ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
      {format.toUpperCase()}
    </button>
  )
}

// ─── Main Reports Component ────────────────────────────────────────────
function Reports() {
  const { token } = useAuth()
  const [summary, setSummary] = useState(null)
  const [agentStats, setAgentStats] = useState([])
  const [catStats, setCatStats] = useState([])
  const [didStats, setDidStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [preset, setPreset] = useState('last_30_days')
  const [activeView, setActiveView] = useState('agents')
  const [exporting, setExporting] = useState({ csv: false, pdf: false })
  const [filters, setFilters] = useState({ agent_id: '', category_id: '', did_id: '', start: '', end: '' })
  const [appliedFilters, setAppliedFilters] = useState({ ...filters })
  const [agents, setAgents] = useState([])
  const [categories, setCategories] = useState([])
  const [dids, setDids] = useState([])
  const [newCalls, setNewCalls] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const prevCallRef = useRef(0)
  const toastTimer = useRef(null)

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    accept: 'application/json',
  })

  const buildParams = useCallback(() => {
    const p = new URLSearchParams()
    if (preset) p.set('preset', preset)
    if (appliedFilters.agent_id) p.set('agent_id', appliedFilters.agent_id)
    if (appliedFilters.category_id) p.set('category_id', appliedFilters.category_id)
    if (appliedFilters.did_id) p.set('did_id', appliedFilters.did_id)
    if (preset === 'custom') {
      if (appliedFilters.start) p.set('custom_start', appliedFilters.start)
      if (appliedFilters.end) p.set('custom_end', appliedFilters.end)
    }
    return p.toString()
  }, [preset, appliedFilters])

  const loadOptions = useCallback(async () => {
    const headers = authHeaders()
    const [{ data: al }, { data: cl }, { data: dl }] = await Promise.all([
      axios.get(`${API}/agents/`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/categories/`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/reports/dids/?preset=last_30_days`, { headers }).catch(() => ({ data: [] })),
    ])
    setAgents(Array.isArray(al) ? al : [])
    setCategories(Array.isArray(cl) ? cl : [])
    setDids(Array.isArray(dl) ? dl : [])
  }, [token])

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const headers = authHeaders()
      const qs = buildParams()
      const [s, a, c, d] = await Promise.all([
        axios.get(`${API}/reports/summary/?${qs}`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/reports/agents/summary/?${qs}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/reports/categories/?${qs}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/reports/dids/?${qs}`, { headers }).catch(() => ({ data: [] })),
      ])

      if (s.data && typeof s.data === 'object') {
        setSummary({
          total_calls: Number(s.data.total_calls ?? 0),
          total_callers: Number(s.data.total_callers ?? 0),
          repeat_callers: Number(s.data.repeat_callers ?? 0),
          repeat_rate: Number(s.data.repeat_rate ?? 0),
          blocked_calls: Number(s.data.blocked_calls ?? 0),
          total_agents: Number(s.data.total_agents ?? 0),
          total_categories: Number(s.data.total_categories ?? 0),
          total_dids: Number(s.data.total_dids ?? 0),
          avg_call_duration: Number(s.data.avg_call_duration ?? 0),
        })

        // Detect new calls for live indicator
        const prev = prevCallRef.current
        const curr = Number(s.data.total_calls ?? 0)
        if (silent && prev > 0 && curr > prev) {
          setNewCalls(curr - prev)
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setNewCalls(0), 4000)
        }
        prevCallRef.current = curr
      }

      const norm = (list = []) => list.map(i => ({
        ...i,
        total_calls: Number(i.total_calls ?? 0),
        repeat_calls: Number(i.repeat_calls ?? 0),
        repeat_rate: Number(i.repeat_rate ?? 0),
        unique_callers: Number(i.unique_callers ?? 0),
        today_calls: Number(i.today_calls ?? 0),
        avg_duration: Number(i.avg_duration ?? 0),
      }))
      setAgentStats(norm(a.data))
      setCatStats(norm(c.data))
      setDidStats(norm(d.data))
    } catch (e) {
      setError('Failed to load report data')
      console.error(e)
    }
    if (!silent) setLoading(false)
  }, [buildParams, token])

  // Initial loads
  useEffect(() => { loadOptions() }, [loadOptions])
  useEffect(() => { loadData() }, [loadData])

  // Auto-polling every 12s
  useEffect(() => {
    const iv = setInterval(() => loadData(true), 12000)
    return () => clearInterval(iv)
  }, [loadData])

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))
  const applyFilters = () => {
    setAppliedFilters({ ...filters })
    setShowFilters(false)
  }
  const clearFilters = () => {
    setFilters({ agent_id: '', category_id: '', did_id: '', start: '', end: '' })
    setAppliedFilters({ agent_id: '', category_id: '', did_id: '', start: '', end: '' })
  }

  const exportFile = async (format) => {
    setExporting(prev => ({ ...prev, [format]: true }))
    try {
      const qs = buildParams()
      const res = await axios.get(`${API}/reports/export/?${qs}&format=${format}`, {
        responseType: 'blob',
        headers: authHeaders(),
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `report_${preset}.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Export failed')
    }
    setExporting(prev => ({ ...prev, [format]: false }))
  }

  const hasActiveFilters = appliedFilters.agent_id || appliedFilters.category_id || appliedFilters.did_id

  const chartData = useMemo(() => {
    if (activeView === 'agents') return agentStats.map(a => ({ name: a.agent_name || '-', calls: a.total_calls, repeat: a.repeat_calls }))
    if (activeView === 'categories') return catStats.map(c => ({ name: c.category_name || 'Unnamed', calls: c.total_calls }))
    return didStats.map(d => ({ name: d.did_number, calls: d.total_calls }))
  }, [activeView, agentStats, catStats, didStats])

  const agentStatsMap = useMemo(() => {
    const m = {}
    agentStats.forEach(a => { m[a.agent_name] = a })
    return m
  }, [agentStats])

  const catStatsMap = useMemo(() => {
    const m = {}
    catStats.forEach(c => { m[c.category_name] = c })
    return m
  }, [catStats])

  const views = [
    { key: 'agents', label: 'By Agent', icon: UserCheck },
    { key: 'categories', label: 'By Category', icon: Layers },
    { key: 'dids', label: 'By DID', icon: Phone },
  ]

  // ── Skeleton Loader ──
  if (loading && !summary) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-80 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle size={40} className="text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">{error}</h2>
        <button onClick={() => loadData()} className="mt-4 btn-primary">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight">Reports & Analytics</h1>
            <p className="text-sm text-text-gray mt-0.5">Call center performance overview</p>
          </div>
          <LiveIndicator />
          {newCalls > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 border border-green-200 rounded-full px-3 py-1 animate-pulse">
              <Activity size={12} />
              +{newCalls} new
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
              showFilters || hasActiveFilters
                ? 'bg-primary text-white border-primary hover:bg-primary-hover'
                : 'bg-white text-text-dark border-border hover:bg-gray-50'
            }`}
          >
            <Filter size={12} />
            Filters
            {hasActiveFilters && <span className="bg-white text-primary text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">!</span>}
          </button>
        </div>
      </div>

      {/* ── Filter Section ── */}
      {showFilters && (
        <div className="card overflow-hidden border-primary/20 shadow-md">
          <div className="px-5 py-3.5 border-b border-border bg-gradient-to-r from-primary/[0.03] to-transparent flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-primary" />
              <span className="text-sm font-semibold text-navy">Filters & Export</span>
              {hasActiveFilters && (
                <span className="badge badge-primary text-[10px]">Active</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ExportButton onExport={exportFile} format="csv" loading={exporting.csv} />
              <ExportButton onExport={exportFile} format="pdf" loading={exporting.pdf} />
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Time Range</label>
                <select value={preset} onChange={e => setPreset(e.target.value)} className="input w-full text-sm">
                  {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Agent</label>
                <select value={filters.agent_id} onChange={e => updateFilter('agent_id', e.target.value)} className="input w-full text-sm">
                  <option value="">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.extension})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">Category</label>
                <select value={filters.category_id} onChange={e => updateFilter('category_id', e.target.value)} className="input w-full text-sm">
                  <option value="">All Categories</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">DID</label>
                <select value={filters.did_id} onChange={e => updateFilter('did_id', e.target.value)} className="input w-full text-sm">
                  <option value="">All DIDs</option>
                  {dids.map(d => <option key={d.did_id} value={d.did_id}>{d.did_number} ({d.category_name})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">From</label>
                <input type="datetime-local" value={filters.start} onChange={e => updateFilter('start', e.target.value)}
                  className="input w-full text-sm" disabled={preset !== 'custom'} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-gray mb-1.5 uppercase tracking-wider">To</label>
                <input type="datetime-local" value={filters.end} onChange={e => updateFilter('end', e.target.value)}
                  className="input w-full text-sm" disabled={preset !== 'custom'} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3">
              {hasActiveFilters && (
                <button onClick={clearFilters} className="btn-outline text-xs px-3 py-1.5">Clear</button>
              )}
              <button onClick={applyFilters} className="btn-primary text-xs px-4 py-1.5">Apply Filters</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary KPI Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total Calls" value={summary.total_calls} icon={Phone} color="blue" subtitle={`Avg ${fmtDuration(summary.avg_call_duration)}`} />
          <KpiCard label="Unique Callers" value={summary.total_callers} icon={Users} color="green" />
          <KpiCard label="Repeat Callers" value={summary.repeat_callers} icon={Repeat} color="amber" trendLabel={`${summary.repeat_rate}% of total`} />
          <KpiCard label="Blocked" value={summary.blocked_calls} icon={Shield} color="red" />
          <KpiCard label="Active Agents" value={summary.total_agents} icon={UserCheck} color="navy" />
          <KpiCard label="Categories" value={summary.total_categories} icon={Layers} color="purple" subtitle={`${summary.total_dids} DIDs`} />
        </div>
      )}

      {/* ── View Tabs ── */}
      <div className="flex border-b border-border">
        {views.map(v => {
          const Icon = v.icon
          return (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
                activeView === v.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-dark hover:border-gray-300'
              }`}
            >
              <Icon size={14} />
              {v.label}
            </button>
          )
        })}
      </div>

      {/* ── Charts Section ── */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => <div key={i} className="card h-[380px] animate-pulse" />)}
        </div>
      ) : chartData.length === 0 ? (
        <div className="card">
          <EmptyState icon={Activity} title="No data for this view" message="Try adjusting the time range or filters." />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-navy">
                {activeView === 'agents' ? 'Calls by Agent' : activeView === 'categories' ? 'Calls by Category' : 'Calls by DID'}
              </h3>
              <span className="text-xs text-text-muted bg-gray-50 px-2.5 py-1 rounded-full">{chartData.reduce((a, b) => a + b.calls, 0).toLocaleString()} total</span>
            </div>
            <ResponsiveContainer width="100%" height={activeView === 'dids' ? 400 : 360}>
              <BarChart data={chartData} barSize={activeView === 'agents' ? 20 : 36} margin={{ top: 5, right: 20, left: 0, bottom: activeView === 'dids' ? 30 : 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} interval={0} angle={activeView === 'dids' ? -30 : activeView === 'agents' ? -25 : 0} textAnchor={activeView === 'dids' || activeView === 'agents' ? 'end' : 'middle'} height={activeView === 'dids' ? 80 : activeView === 'agents' ? 60 : 40} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null
                    const item = payload[0]?.payload
                    if (!item) return null
                    const statsMap = activeView === 'agents' ? agentStatsMap : activeView === 'categories' ? catStatsMap : undefined
                    const data = statsMap?.[label]
                    if (!data) {
                      return (
                        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 14px', minWidth: 140 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{label}</p>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Total Calls: <strong>{item.calls}</strong></div>
                        </div>
                      )
                    }
                    if (activeView === 'agents') {
                      return (
                        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14, minWidth: 200 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>{data.agent_name}</p>
                          <div style={{ borderTop: '1px solid #E1E6ED', paddingTop: 8, fontSize: 12 }}>
                            <Row label="Extension" value={data.extension} mono />
                            <Row label="Total Calls" value={data.total_calls} bold />
                            <Row label="Unique Callers" value={data.unique_callers} />
                            <Row label="Repeat Calls" value={data.repeat_calls} />
                            <Row label="Repeat Rate" value={`${data.repeat_rate}%`} color={data.repeat_rate > 20 ? '#E53317' : data.repeat_rate > 10 ? '#F5A623' : '#00C88A'} />
                            <Row label="Avg Duration" value={`${data.avg_duration || 0}s`} />
                            <Row label="Today Calls" value={data.today_calls || 0} color={data.today_calls > 0 ? '#00C88A' : '#94A1B6'} />
                          </div>
                        </div>
                      )
                    }
                    if (activeView === 'categories') {
                      return (
                        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14, minWidth: 200 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>{data.category_name || label}</p>
                          <div style={{ borderTop: '1px solid #E1E6ED', paddingTop: 8, fontSize: 12 }}>
                            <Row label="Total Calls" value={data.total_calls} bold />
                            <Row label="Unique Callers" value={data.unique_callers} />
                            <Row label="Repeat Rate" value={`${data.repeat_rate}%`} color={data.repeat_rate > 20 ? '#E53317' : data.repeat_rate > 10 ? '#F5A623' : '#00C88A'} />
                            <Row label="Agents" value={data.total_agents} />
                            <Row label="Today Calls" value={data.today_calls || 0} color={data.today_calls > 0 ? '#00C88A' : '#94A1B6'} />
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 14px', minWidth: 140 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{label}</p>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Total Calls: <strong>{item.calls}</strong></div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="calls" fill="#3B8CFF" name="Calls" radius={[6, 6, 0, 0]} maxBarSize={48} />
                {activeView === 'agents' && <Bar dataKey="repeat" fill="#F5A623" name="Repeat" radius={[6, 6, 0, 0]} maxBarSize={48} />}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-navy">Distribution</h3>
              <span className="text-xs text-text-muted bg-gray-50 px-2.5 py-1 rounded-full">by {activeView === 'categories' ? 'category' : activeView === 'dids' ? 'DID' : 'agent'}</span>
            </div>
            <ResponsiveContainer width="100%" height={activeView === 'dids' ? 400 : 360}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%" cy="45%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="calls"
                  label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={{ stroke: '#94A1B6', strokeWidth: 1, strokeDasharray: '2 2' }}
                >
                  {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null
                    const item = payload[0]?.payload
                    if (!item) return null
                    const statsMap = activeView === 'agents' ? agentStatsMap : activeView === 'categories' ? catStatsMap : undefined
                    const data = statsMap?.[label]
                    if (!data) {
                      return (
                        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 14px', minWidth: 140 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{label}</p>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Total Calls: <strong>{item.calls}</strong></div>
                        </div>
                      )
                    }
                    if (activeView === 'agents') {
                      return (
                        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14, minWidth: 200 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>{data.agent_name}</p>
                          <div style={{ borderTop: '1px solid #E1E6ED', paddingTop: 8, fontSize: 12 }}>
                            <Row label="Extension" value={data.extension} mono />
                            <Row label="Total Calls" value={data.total_calls} bold />
                            <Row label="Unique Callers" value={data.unique_callers} />
                            <Row label="Repeat Calls" value={data.repeat_calls} />
                            <Row label="Repeat Rate" value={`${data.repeat_rate}%`} color={data.repeat_rate > 20 ? '#E53317' : data.repeat_rate > 10 ? '#F5A623' : '#00C88A'} />
                            <Row label="Avg Duration" value={`${data.avg_duration || 0}s`} />
                            <Row label="Today Calls" value={data.today_calls || 0} color={data.today_calls > 0 ? '#00C88A' : '#94A1B6'} />
                          </div>
                        </div>
                      )
                    }
                    if (activeView === 'categories') {
                      return (
                        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14, minWidth: 200 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>{data.category_name || label}</p>
                          <div style={{ borderTop: '1px solid #E1E6ED', paddingTop: 8, fontSize: 12 }}>
                            <Row label="Total Calls" value={data.total_calls} bold />
                            <Row label="Unique Callers" value={data.unique_callers} />
                            <Row label="Repeat Rate" value={`${data.repeat_rate}%`} color={data.repeat_rate > 20 ? '#E53317' : data.repeat_rate > 10 ? '#F5A623' : '#00C88A'} />
                            <Row label="Agents" value={data.total_agents} />
                            <Row label="Today Calls" value={data.today_calls || 0} color={data.today_calls > 0 ? '#00C88A' : '#94A1B6'} />
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E1E6ED', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 14px', minWidth: 140 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{label}</p>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Total Calls: <strong>{item.calls}</strong></div>
                      </div>
                    )
                  }}
                />
                <Legend verticalAlign="bottom" iconType="circle" iconSize={9} wrapperStyle={{ paddingTop: 16, fontSize: 11 }} formatter={v => <span className="text-xs text-text-gray">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Detail Tables ── */}
      {loading ? (
        <div className="card h-48 animate-pulse" />
      ) : (
        <>
          {/* Agent Table */}
          {activeView === 'agents' && agentStats.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">Agent Performance</h3>
                <span className="text-xs text-text-muted">{agentStats.length} agents</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Agent</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Ext</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Calls</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Unique</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Repeat</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Rate</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Avg Duration</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.map((a, i) => (
                      <tr key={a.agent_id} className={`border-t border-border hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold">
                              {(a.agent_name || '?')[0].toUpperCase()}
                            </div>
                            <span>{a.agent_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-muted font-mono text-xs">{a.extension}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNum(a.total_calls)}</td>
                        <td className="px-4 py-3 text-right text-text-gray">{formatNum(a.unique_callers)}</td>
                        <td className="px-4 py-3 text-right text-text-gray">{formatNum(a.repeat_calls)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`badge ${a.repeat_rate > 20 ? 'badge-danger' : a.repeat_rate > 10 ? 'badge-warning' : 'badge-success'} text-[10px]`}>
                            {a.repeat_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-text-muted text-xs">{fmtDuration(a.avg_duration)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-medium ${a.today_calls > 0 ? 'text-green-600' : 'text-text-muted'}`}>
                            {a.today_calls || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Category Table */}
          {activeView === 'categories' && catStats.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">Category Performance</h3>
                <span className="text-xs text-text-muted">{catStats.length} categories</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Calls</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Callers</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Repeat Rate</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Agents</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catStats.map((c, i) => (
                      <tr key={c.category_id} className={`border-t border-border hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3 font-medium">{c.category_name}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNum(c.total_calls)}</td>
                        <td className="px-4 py-3 text-right text-text-gray">{formatNum(c.unique_callers)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`badge ${c.repeat_rate > 20 ? 'badge-danger' : c.repeat_rate > 10 ? 'badge-warning' : 'badge-success'} text-[10px]`}>
                            {c.repeat_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-text-gray">{c.total_agents}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-medium ${c.today_calls > 0 ? 'text-green-600' : 'text-text-muted'}`}>
                            {c.today_calls || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DID Table */}
          {activeView === 'dids' && didStats.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">DID Performance</h3>
                <span className="text-xs text-text-muted">{didStats.length} DIDs</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">DID</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Calls</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Callers</th>
                      <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted text-right">Avg / DID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {didStats.map((d, i) => (
                      <tr key={d.did_id} className={`border-t border-border hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3 font-medium font-mono text-xs">{d.did_number}</td>
                        <td className="px-4 py-3 text-text-gray">{d.category_name}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNum(d.total_calls)}</td>
                        <td className="px-4 py-3 text-right text-text-gray">{formatNum(d.unique_callers)}</td>
                        <td className="px-4 py-3 text-right text-text-muted text-xs">
                          {d.unique_callers > 0 ? (d.total_calls / d.unique_callers).toFixed(1) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state for any view */}
          {(activeView === 'agents' && agentStats.length === 0) ||
           (activeView === 'categories' && catStats.length === 0) ||
           (activeView === 'dids' && didStats.length === 0) ? (
            <div className="card">
              <EmptyState icon={Activity} title="No data for this view" message="Calls will appear here once agents start routing calls." />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

export default Reports
