/**
 * Settings page - manages AMI connection, routing, SMTP, users, and backups
 */
import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API = '/api/v1'

function Settings() {
  // Existing settings state
  const [amiHost, setAmiHost] = useState('127.0.0.1')
  const [amiPort, setAmiPort] = useState('5038')
  const [amiUser, setAmiUser] = useState('admin')
  const [amiPassword, setAmiPassword] = useState('')
  const [pollInterval, setPollInterval] = useState('5')
  const [agentStatusTtl, setAgentStatusTtl] = useState('60')
  const [stickyWindowDays, setStickyWindowDays] = useState('30')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState('ami')

  // User management state
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState('')
  const [showUserModal, setShowUserModal] = useState(false)
  const [userModalMode, setUserModalMode] = useState('create') // 'create' | 'edit'
  const [currentUser, setCurrentUser] = useState(null)
  const userFormInitial = { username: '', email: '', password: '', full_name: '', role: 'admin' }
  const [userForm, setUserForm] = useState(userFormInitial)
  const [passwordResetMsg, setPasswordResetMsg] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  // SMTP test state
  const [smtpTestEmail, setSmtpTestEmail] = useState('')
  const [smtpTestLoading, setSmtpTestLoading] = useState(false)
  const [smtpTestMsg, setSmtpTestMsg] = useState('')
  const [smtpTestError, setSmtpTestError] = useState('')

  const handleSmtpTest = async () => {
    setSmtpTestMsg('')
    setSmtpTestError('')
    if (!smtpTestEmail) {
      setSmtpTestError('Enter a recipient email address first')
      return
    }
    setSmtpTestLoading(true)
    try {
      const res = await axios.post(`${API}/config/smtp/test`, {
  to_email: smtpTestEmail,
})
setSmtpTestMsg(res.data?.message || 'Test email queued successfully')
      setSmtpTestMsg(res.data?.message || 'Test email queued successfully')
      setTimeout(() => setSmtpTestMsg(''), 4000)
    } catch (err) {
      setSmtpTestError(err.response?.data?.detail || 'SMTP test failed')
    } finally {
      setSmtpTestLoading(false)
    }
  }

  // Backup state
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')

  // SMTP state
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpUseTls, setSmtpUseTls] = useState(true)
  const [smtpSaved, setSmtpSaved] = useState(false)
  const [smtpSaveError, setSmtpSaveError] = useState('')

  // Audit state
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditAction, setAuditAction] = useState('')
  const [auditResource, setAuditResource] = useState('')
  const [auditSearch, setAuditSearch] = useState('')

  // Load settings on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await axios.get(`${API}/config/ami/`)
        if (res.data.asterisk_host) setAmiHost(res.data.asterisk_host)
        if (res.data.asterisk_port) setAmiPort(String(res.data.asterisk_port))
        if (res.data.ami_username) setAmiUser(res.data.ami_username)
        if (res.data.ami_password) setAmiPassword(res.data.ami_password)
        if (res.data.poll_interval) setPollInterval(String(res.data.poll_interval))
        if (res.data.agent_status_ttl) setAgentStatusTtl(String(res.data.agent_status_ttl))
        if (res.data.sticky_window_days) setStickyWindowDays(String(res.data.sticky_window_days))
      } catch (err) { console.log('Backend not available yet') }
    }
    loadConfig()
    loadUsers()
    loadSmtpConfig()
  }, [])

  const loadAudit = async () => {
    setAuditLoading(true)
    try {
      const params = new URLSearchParams({ page: String(auditPage), limit: '50' })
      if (auditAction) params.set('action', auditAction)
      if (auditResource) params.set('resource_type', auditResource)
      if (auditSearch) params.set('search', auditSearch)
      const res = await axios.get(`${API}/audit/logs/?${params.toString()}`)
      const data = res.data
      setAuditLogs(Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [])
      setAuditTotal(typeof data?.total === 'number' ? data.total : (Array.isArray(data) ? data.length : 0))
    } catch (e) { console.error(e) }
    setAuditLoading(false)
  }
  useEffect(() => { loadAudit() }, [auditPage, auditAction, auditResource, auditSearch])

  const auditResetFilters = () => {
    setAuditAction('')
    setAuditResource('')
    setAuditSearch('')
    setAuditPage(1)
  }

  // ==================== AMI / Routing Settings ====================

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await axios.post(`${API}/config/ami/`, {
        asterisk_host: amiHost,
        asterisk_port: parseInt(amiPort),
        ami_username: amiUser,
        ami_password: amiPassword,
        poll_interval: parseInt(pollInterval),
        agent_status_ttl: parseInt(agentStatusTtl),
        sticky_window_days: parseInt(stickyWindowDays),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setLoading(false)
    }
  }

  // ==================== User Management ====================

  const loadUsers = async () => {
    setUserLoading(true)
    try {
      let url = `${API}/users/`
      const params = []
      if (userSearch) params.push(`search=${encodeURIComponent(userSearch)}`)
      if (userRoleFilter) params.push(`role=${userRoleFilter}`)
      if (userStatusFilter) params.push(`status=${userStatusFilter}`)
      if (params.length) url += '?' + params.join('&')
      const res = await axios.get(url)
      setUsers(res.data)
    } catch (err) { console.error('Failed to load users:', err) }
    setUserLoading(false)
  }

  const openCreateUser = () => {
    setUserModalMode('create')
    setCurrentUser(null)
    setUserForm({ username: '', email: '', password: '', full_name: '', role: 'admin' })
    setShowUserModal(true)
  }

  const openEditUser = (user) => {
    setUserModalMode('edit')
    setCurrentUser(user)
    setUserForm({
      username: user.username,
      email: user.email,
      password: '',
      full_name: user.full_name || '',
      role: user.role,
    })
    setShowUserModal(true)
  }

  const handleUserSubmit = async () => {
    try {
      if (userModalMode === 'create') {
        if (!userForm.username || !userForm.email || !userForm.password) {
          alert('Username, email, and password are required')
          return
        }
        await axios.post(`${API}/users/`, userForm)
      } else {
        const updateData = { ...userForm }
        if (!updateData.password) delete updateData.password
        await axios.put(`${API}/users/${currentUser.id}/`, updateData)
      }
      setShowUserModal(false)
      loadUsers()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving user')
    }
  }

  const handleDeleteUser = async (user) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    try {
      await axios.delete(`${API}/users/${user.id}/`)
      loadUsers()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error deleting user')
    }
  }

  const handleResetPassword = async (user) => {
    if (!confirm(`Reset password for "${user.username}"? The new password will be "changeme123"`)) return
    try {
      const res = await axios.post(`${API}/users/${user.id}/reset-password/`)
      setPasswordResetMsg(`Password reset for "${user.username}": ${res.data.new_password}`)
      setTimeout(() => setPasswordResetMsg(''), 8000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error resetting password')
    }
  }

  // ==================== My Profile ====================
  const [myProfile, setMyProfile] = useState({ full_name: '', email: '', username: '', role: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileForm, setProfileForm] = useState({ full_name: '', current_password: '', new_password: '', confirm_password: '' })
  const [profileMsg, setProfileMsg] = useState('')

  const loadMyProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await axios.get(`${API}/auth/me/`)
      const u = res.data
      setMyProfile({ full_name: u.full_name || '', email: u.email || '', username: u.username || '', role: u.role || '' })
      setProfileForm({ full_name: u.full_name || '', current_password: '', new_password: '', confirm_password: '' })
    } catch { /* auth may not be ready */ }
    setProfileLoading(false)
  }
  const saveMyProfile = async () => {
    if (profileForm.new_password && !profileForm.current_password) {
      setProfileMsg('Current password is required to change password')
      return
    }
    if (profileForm.new_password && profileForm.new_password !== profileForm.confirm_password) {
      setProfileMsg('New passwords do not match')
      return
    }
    setProfileLoading(true)
    setProfileMsg('')
    try {
      const payload = { full_name: profileForm.full_name, current_password: profileForm.current_password || null, new_password: profileForm.new_password || null }
      await axios.put(`${API}/auth/profile/`, payload)
      setProfileMsg('Profile updated')
      setProfileForm(f => ({ ...f, current_password: '', new_password: '', confirm_password: '' }))
      const res2 = await axios.get(`${API}/auth/me/`)
      setMyProfile({ full_name: res2.data.full_name || '', email: res2.data.email || '', username: res2.data.username || '', role: res2.data.role || '' })
    } catch (err) {
      setProfileMsg(err.response?.data?.detail || 'Failed to update profile')
    }
    setProfileLoading(false)
  }

  const toggleUserStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active'
    try {
      await axios.put(`${API}/users/${user.id}/`, { status: newStatus })
      loadUsers()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error updating status')
    }
  }

  // ==================== Backup / Restore ====================

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await axios.get(`${API}/backup/export/`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `efada_backup_${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + (err.response?.data?.detail || err.message))
    }
    setExporting(false)
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!confirm('This will OVERWRITE all current data with the backup contents. Continue?')) return
    setImporting(true)
    setImportError('')
    setImportSuccess('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post(`${API}/backup/import/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportSuccess('Backup restored successfully!')
      setTimeout(() => {
        localStorage.clear()
        window.location.reload(true)
      }, 1500)
    } catch (err) {
      setImportError(err.response?.data?.detail || 'Import failed')
    }
    setImporting(false)
    e.target.value = ''
  }

  // ==================== SMTP Settings ====================

  const loadSmtpConfig = async () => {
    try {
      const res = await axios.get(`${API}/config/smtp`)
      setSmtpHost(res.data.smtp_host || '')
      setSmtpPort(String(res.data.smtp_port || 587))
      setSmtpUser(res.data.smtp_username || '')
      setSmtpPassword(res.data.smtp_password || '')
      setSmtpFrom(res.data.smtp_from || '')
      setSmtpUseTls(res.data.smtp_use_tls !== false)
    } catch {
      // No SMTP config yet — use defaults
    }
  }

  const handleSmtpSave = async () => {
    setSmtpSaved(false)
    setSmtpTestError('')
    try {
      await axios.post(`${API}/config/smtp`, {
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort),
        smtp_username: smtpUser,
        smtp_password: smtpPassword,
        smtp_from: smtpFrom,
        smtp_use_tls: smtpUseTls,
      })
      setSmtpSaved(true)
      setTimeout(() => setSmtpSaved(false), 2500)
    } catch (err) {
      const detail = err.response?.data?.detail
      setSmtpTestError(typeof detail === 'string' ? detail : 'Failed to save SMTP settings')
    }
  }

  const currentProfileFromAuth = typeof window !== 'undefined' ? window.__CURRENT_USER__ : null

  // ==================== Tabs ====================

  const tabs = [
    { key: 'ami', label: 'AMI Connection', icon: '🔌' },
    { key: 'routing', label: 'Routing', icon: '🔄' },
    { key: 'smtp', label: 'SMTP Settings', icon: '📧' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'audit', label: 'Audit Logs', icon: '📋' },
    { key: 'profile', label: 'My Profile', icon: '👤' },
    { key: 'backup', label: 'Backup & Restore', icon: '💾' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-dark">Settings</h1>
          <p className="text-sm text-text-muted mt-1">Configure system settings and preferences</p>
        </div>
        {saved && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success text-sm font-medium rounded-lg animate-pulse">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12.6a5.4 5.4 0 0-5.4-12.6m5.4 12.6L24 18m-1.41-3.54L8.18 6.24M18 18L6.18 6.24" />
            </svg>
            <span>Saved!</span>
          </div>
        )}
        {smtpSaved && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success text-sm font-medium rounded-lg animate-pulse">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12.6a5.4 5.4 0 0-5.4-12.6m5.4 12.6L24 18m-1.41-3.54L8.18 6.24M18 18L6.18 6.24" />
            </svg>
            <span>SMTP Saved!</span>
          </div>
        )}
        {smtpSaveError && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 text-sm font-medium rounded-lg">
            <span>{smtpSaveError}</span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-border gap-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
              activeTab === tab.key
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-text-gray hover:text-text-dark hover:bg-white/50'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* ==================== AMI Connection Tab ==================== */}
      {activeTab === 'ami' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-soft border border-border overflow-hidden">
            <div className="px-6 py-4 bg-blue-50 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16m8-4m0 0l4 4m-4-4l-4 4M4 16V8a6-6 0 014-4h8a6-6 0 014 4v8H4m0 0l-4 4m4-4l4 4m-4 4V8" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-text-dark">AMI Connection</h2>
                  <p className="text-xs text-text-muted">Configure Asterisk AMI server settings</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Asterisk Host</label>
                <input type="text" value={amiHost} onChange={e => setAmiHost(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="127.0.0.1" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">AMI Port</label>
                <input type="number" value={amiPort} onChange={e => setAmiPort(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="5038" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">AMI Username</label>
                <input type="text" value={amiUser} onChange={e => setAmiUser(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="admin" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">AMI Password</label>
                <input type="password" value={amiPassword} onChange={e => setAmiPassword(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="••••••••" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Routing Settings Tab ==================== */}
      {activeTab === 'routing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-soft border border-border overflow-hidden">
            <div className="px-6 py-4 bg-success/10 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16.95V13m0-4.95a3 3 0 013 3m0 0a3 3 0 01-3 3m3-3a3 3 0 013-3m0 0L20 4m-8 8l-4-4m4 4l4-4m-4 4V20" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-text-dark">Routing Settings</h2>
                  <p className="text-xs text-text-muted">Call routing and agent management</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Poll Interval (seconds)</label>
                <input type="number" value={pollInterval} onChange={e => setPollInterval(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="5" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Agent Status TTL (seconds)</label>
                <input type="number" value={agentStatusTtl} onChange={e => setAgentStatusTtl(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="60" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Sticky Agent Window (days)</label>
                <input type="number" value={stickyWindowDays} onChange={e => setStickyWindowDays(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="30" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SMTP Settings Tab ==================== */}
      {activeTab === 'smtp' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-soft border border-border overflow-hidden">
            <div className="px-6 py-4 bg-purple-50 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9-3 0 019 3 0 019-3 0 019-3 0 019-3 0 019-3 0 019-3" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-text-dark">SMTP Settings</h2>
                  <p className="text-xs text-text-muted">Custom SMTP server for email alerts and notifications</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <label className="block text-xs text-text-gray uppercase tracking-wide font-medium">Use TLS (SSL)</label>
                <input
                  type="checkbox"
                  checked={smtpUseTls}
                  onChange={e => setSmtpUseTls(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">SMTP Host</label>
                <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="smtp.example.com" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">SMTP Port</label>
                <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="587" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Username</label>
                <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="smtp@example.com" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Password</label>
                <input type="password" value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">From Address</label>
                <input
                  type="text"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition"
                  placeholder="noreply@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Verify settings</label>
                <p className="text-[11px] text-text-muted mb-2">Send a test message using the saved SMTP settings after saving.</p>
                <div className="flex flex-col gap-2">
                  <input
                    type="email"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition"
                    placeholder="recipient@example.com"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                  />
                  {smtpTestError && <div className="text-xs text-red-600">{smtpTestError}</div>}
                  {smtpTestMsg && <div className="text-xs text-green-700">{smtpTestMsg}</div>}
                  <button
                    onClick={handleSmtpSave}
                    disabled={loading}
                    className="bg-navy text-white px-3 py-2 rounded-lg text-sm disabled:opacity-60 w-fit"
                  >
                    {loading ? 'Saving...' : 'Save SMTP Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Users Tab ==================== */}
      {activeTab === 'users' && (
        <div>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="border border-border rounded-lg px-3 py-2 text-sm w-24 md:w-40 focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <select
                value={userRoleFilter}
                onChange={e => setUserRoleFilter(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="agent">Agent</option>
                <option value="viewer">Viewer</option>
              </select>
              <select
                value={userStatusFilter}
                onChange={e => setUserStatusFilter(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button onClick={loadUsers} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">Search</button>
            </div>
            <button onClick={openCreateUser} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition w-full sm:w-auto text-center">
              + Add User
            </button>
          </div>

          {/* Password reset message */}
          {passwordResetMsg && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              {passwordResetMsg}
            </div>
          )}

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-bg-light">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-gray">Status</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Username</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Email</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Full Name</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Role</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Last Login</th>
                    <th className="px-4 py-3 font-medium text-text-gray text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-t border-border hover:bg-bg-light/50 transition">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleUserStatus(user)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer ${
                            user.status === 'active'
                              ? 'bg-success/10 text-success hover:bg-success/20'
                              : 'bg-text-muted/10 text-text-muted hover:bg-text-muted/20'
                          }`}
                        >
                          {user.status}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium">{user.username}</td>
                      <td className="px-4 py-3 text-text-gray">{user.email}</td>
                      <td className="px-4 py-3 text-text-gray">{user.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-navy/10 text-navy">{user.role}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => openEditUser(user)} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5">Edit</button>
                          <button onClick={() => handleResetPassword(user)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy/5">Reset Pwd</button>
                          <button onClick={() => handleDeleteUser(user)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan="7" className="px-4 py-10 text-center text-text-muted">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Backup & Restore Tab ==================== */}
      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Export */}
          <div className="bg-white rounded-xl shadow-soft border border-border overflow-hidden">
            <div className="px-6 py-4 bg-blue-50 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-text-dark">Export Backup</h2>
                  <p className="text-xs text-text-muted">Download full database as JSON</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-text-gray mb-4">Export all data including agents, categories, call logs, callers, and users.</p>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" strokeWidth="2" />
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16l4-4m0 0l-4-4m4 4H12a3-3 0 013-3V8a3 3 0 013 3m0 0l6-6m-6 6l6 6" />
                    </svg>
                    <span>Download Backup</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Restore */}
          <div className="bg-white rounded-xl shadow-soft border border-border overflow-hidden">
            <div className="px-6 py-4 bg-orange-50 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-text-dark">Restore Backup</h2>
                  <p className="text-xs text-text-muted">Upload and restore from a JSON backup file</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-text-gray mb-4">Upload a previously exported backup file. This will overwrite all current data.</p>
              <div className="mb-4">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  disabled={importing}
                  className="block w-full text-sm text-text-gray file:text-sm rounded-lg border border-border px-3 py-2 bg-white hover:bg-bg-light transition disabled:opacity-50"
                />
              </div>
              {importSuccess && (
                <div className="mb-4 p-3 bg-success/10 text-success text-sm rounded-lg">{importSuccess}</div>
              )}
              {importError && (
                <div className="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{importError}</div>
              )}
              <button
                onClick={() => document.querySelector('input[type="file"]').click()}
                disabled={importing}
                className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" strokeWidth="2" />
                    </svg>
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16m8-4m0 0l4 4m-4-4l-4 4M4 16V8a6-6 0 014-4h8a6-6 0 014 4v8H4m0 0l-4 4m4-4l4 4m-4 4V8" />
                    </svg>
                    <span>Upload & Restore</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl shadow-soft border border-border overflow-hidden">
          <div className="px-6 py-4 bg-indigo-50 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-heading font-semibold text-text-dark">My Profile</h2>
                <p className="text-xs text-text-muted">{myProfile.username ? `${myProfile.username} · ${myProfile.role}` : 'Loading profile...'}</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Full Name</label>
                <input type="text" value={profileForm.full_name} onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Email</label>
                <input type="text" value={myProfile.email} disabled className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-gray-50" />
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-text-dark mb-2">Change Password</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Current Password</label>
                  <input type="password" value={profileForm.current_password} onChange={e => setProfileForm(f => ({ ...f, current_password: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">New Password</label>
                  <input type="password" value={profileForm.new_password} onChange={e => setProfileForm(f => ({ ...f, new_password: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="Leave blank to keep current" />
                </div>
                <div>
                  <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Confirm New Password</label>
                  <input type="password" value={profileForm.confirm_password} onChange={e => setProfileForm(f => ({ ...f, confirm_password: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition" placeholder="Re-type new password" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveMyProfile} disabled={profileLoading} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-hover transition disabled:opacity-50">Save Changes</button>
              {profileForm && <span className="text-xs text-text-muted">{profileMsg}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ==================== Audit Logs Tab ==================== */}
      {activeTab === 'audit' && (
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-border p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Action</label>
                <select value={auditAction} onChange={e => { setAuditAction(e.target.value); setAuditPage(1) }} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
                  <option value="">All</option>
                  <option value="create">Create</option>
                  <option value="update">Update</option>
                  <option value="delete">Delete</option>
                  <option value="status_change">Status Change</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Resource</label>
                <select value={auditResource} onChange={e => { setAuditResource(e.target.value); setAuditPage(1) }} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
                  <option value="">All</option>
                  <option value="agent">Agent</option>
                  <option value="category">Category</option>
                  <option value="did">DID</option>
                  <option value="caller">Caller</option>
                  <option value="user">User</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1 uppercase tracking-wide">Search</label>
                <input value={auditSearch} onChange={e => { setAuditSearch(e.target.value); setAuditPage(1) }} placeholder="Search details..." className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
              </div>
            </div>
            <div className="mt-3">
              <button onClick={auditResetFilters} className="px-3 py-2 rounded border border-border hover:bg-bg-light text-sm">Reset filters</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-bg-light">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-gray">Time</th>
                    <th className="px-4 py-3 font-medium text-text-gray">User</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Action</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Resource</th>
                    <th className="px-4 py-3 font-medium text-text-gray">Details</th>
                    <th className="px-4 py-3 font-medium text-text-gray">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-text-muted">Loading...</td></tr>
                  ) : auditLogs.length === 0 ? (
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-text-muted">No audit logs found.</td></tr>
                  ) : auditLogs.map((log, i) => (
                    <tr key={log.id || i} className="border-t border-border hover:bg-bg-light/50 transition">
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-text-dark">{log.username || 'System'}</div>
                        <div className="text-[10px] text-text-muted">{log.role || '—'}</div>
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{log.action}</span></td>
                      <td className="px-4 py-3 text-xs text-text-gray">{log.resource_type}{log.resource_id ? ` #${log.resource_id}` : ''}</td>
                      <td className="px-4 py-3 text-xs text-text-muted max-w-[260px] truncate" title={typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}>{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-text-muted">{log.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="text-xs text-text-muted">Showing {auditLogs.length} of {auditTotal}</div>
              <div className="flex items-center gap-2">
                <button disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)} className="px-3 py-1 rounded border border-border bg-white hover:bg-bg-light disabled:opacity-50 text-sm">Prev</button>
                <button disabled={auditLogs.length < 50} onClick={() => setAuditPage(p => p + 1)} className="px-3 py-1 rounded border border-border bg-white hover:bg-bg-light disabled:opacity-50 text-sm">Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Save Button (for AMI / Routing tabs) ==================== */}
      {activeTab !== 'backup' && activeTab !== 'smtp' && (
        <div className="flex justify-end pt-4 border-t border-border">
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" strokeWidth="2" />
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12l4-4m0 0l-4-4m4 4V12m0 0l6-6m-6 6l6 6" />
                </svg>
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ==================== Save Button for SMTP ==================== */}
      {activeTab === 'smtp' && (
        <div className="flex justify-end pt-4 border-t border-border">
          <button
            onClick={handleSmtpSave}
            className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12l4-4m0 0l-4-4m4 4V12m0 0l6-6m-6 6l6 6" />
            </svg>
            <span>Save SMTP Settings</span>
          </button>
        </div>
      )}

      {/* ==================== User Modal ==================== */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-heading font-bold text-navy">
                {userModalMode === 'create' ? 'Add User' : 'Edit User'}
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-text-muted hover:text-text-dark p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Username</label>
                <input
                  type="text"
                  value={userForm.username}
                  onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                  disabled={userModalMode === 'edit'}
                  placeholder="john.doe"
                />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                  placeholder="john@example.com"
                />
              </div>
              {userModalMode === 'create' && (
                <div>
                  <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Password</label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>
              )}
              {userModalMode === 'edit' && (
                <div>
                  <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">New Password (leave blank to keep current)</label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Full Name</label>
                <input
                  type="text"
                  value={userForm.full_name}
                  onChange={e => setUserForm({ ...userForm, full_name: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs text-text-gray mb-1.5 uppercase tracking-wide font-medium">Role</label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowUserModal(false)} className="flex-1 bg-bg-light py-2.5 rounded-lg hover:bg-border transition text-sm font-medium">Cancel</button>
              <button onClick={handleUserSubmit} className="flex-1 bg-primary text-white py-2.5 rounded-lg hover:bg-primary-dark transition text-sm font-medium">
                {userModalMode === 'create' ? 'Create User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
