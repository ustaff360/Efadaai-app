/**
 * Settings page - manages AMI connection, routing, and system config
 */
import React, { useState, useEffect } from 'react'

const API = 'http://192.168.1.20:8000'

export default function Settings() {
  const [amiHost, setAmiHost] = useState('127.0.0.1')
  const [amiPort, setAmiPort] = useState('5038')
  const [amiUser, setAmiUser] = useState('admin')
  const [amiPassword, setAmiPassword] = useState('admin123')
  const [pollInterval, setPollInterval] = useState('5')
  const [agentStatusTtl, setAgentStatusTtl] = useState('60')
  const [stickyWindowDays, setStickyWindowDays] = useState('30')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Load current config
    const loadConfig = async () => {
      try {
        const res = await fetch(`${API}/api/v1/health`)
        if (res.ok) {
          console.log('Backend is running')
        }
      } catch (err) {
        console.log('Backend not available yet')
      }
    }
    loadConfig()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      // Save AMI settings via config endpoint
      await fetch(`${API}/api/v1/config/ami`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asterisk_host: amiHost,
          asterisk_port: parseInt(amiPort),
          ami_username: amiUser,
          ami_password: amiPassword,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-dark">Settings</h1>
          <p className="text-sm text-text-muted">Configure system settings</p>
        </div>
        {saved && (
          <div className="text-green-600 text-sm">Saved!</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AMI Connection */}
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-text-dark">AMI Connection</h2>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Asterisk Host</label>
            <input
              type="text"
              value={amiHost}
              onChange={e => setAmiHost(e.target.value)}
              className="input w-full"
              placeholder="127.0.0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">AMI Port</label>
            <input
              type="number"
              value={amiPort}
              onChange={e => setAmiPort(e.target.value)}
              className="input w-full"
              placeholder="5038"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">AMI Username</label>
            <input
              type="text"
              value={amiUser}
              onChange={e => setAmiUser(e.target.value)}
              className="input w-full"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">AMI Password</label>
            <input
              type="password"
              value={amiPassword}
              onChange={e => setAmiPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
            />
          </div>
        </div>

        {/* Routing Settings */}
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-text-dark">Routing Settings</h2>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Poll Interval (seconds)</label>
            <input
              type="number"
              value={pollInterval}
              onChange={e => setPollInterval(e.target.value)}
              className="input w-full"
              placeholder="5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Agent Status TTL (seconds)</label>
            <input
              type="number"
              value={agentStatusTtl}
              onChange={e => setAgentStatusTtl(e.target.value)}
              className="input w-full"
              placeholder="60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Sticky Agent Window (days)</label>
            <input
              type="number"
              value={stickyWindowDays}
              onChange={e => setStickyWindowDays(e.target.value)}
              className="input w-full"
              placeholder="30"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="btn-primary px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
