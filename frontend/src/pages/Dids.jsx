import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../AuthContext'

const API = '/api/v1'

export default function Dids() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ did_number: '', description: '', category_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const headers = { Authorization: `Bearer ${token}`, accept: 'application/json' }

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: cats }, { data: dids }] = await Promise.all([
        axios.get(`${API}/categories/`, { headers }),
        axios.get(`${API}/categories/all-dids/`, { headers }).catch(() => ({ data: [] })),
      ])
      setCategories(Array.isArray(cats) ? cats : [])
      setItems(Array.isArray(dids) ? dids : [])
    } catch (e) {
      console.error('Failed to load DIDs', e)
      setItems([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const save = async () => {
    setError('')
    if (!form.did_number.trim()) {
      setError('DID number is required')
      return
    }
    if (!form.category_id) {
      setError('Category is required')
      return
    }
    setSaving(true)
    try {
      await axios.post(
        `${API}/categories/${form.category_id}/dids/`,
        { did_number: form.did_number.trim(), description: form.description.trim() || '' },
        { headers },
      )
      setForm({ did_number: '', description: '', category_id: form.category_id })
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create DID')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (did) => {
    if (!confirm('Remove this DID?')) return
    try {
      await axios.delete(`${API}/categories/${did.category_id}/dids/${did.id}/`, { headers })
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed')
    }
  }

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || 'Unknown'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-navy">DID Management</h2>
          <p className="text-sm text-text-gray mt-1">{items.length} DIDs</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">DID Number</label>
            <input
              type="text"
              value={form.did_number}
              onChange={(e) => setForm({ ...form, did_number: e.target.value })}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="e.g. 6312460606"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-gray">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="Optional"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add DID'}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-bg-light">
              <tr>
                <th className="px-4 py-3 font-medium text-text-gray">DID Number</th>
                <th className="px-4 py-3 font-medium text-text-gray">Category</th>
                <th className="px-4 py-3 font-medium text-text-gray">Description</th>
                <th className="px-4 py-3 text-right font-medium text-text-gray">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3" className="px-4 py-10 text-center text-text-gray">Loading DIDs...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-4 py-10 text-center text-text-muted">No DIDs found.</td>
                </tr>
              ) : (
                items.map((did) => (
                  <tr key={did.id} className="border-t border-border last:border-0 hover:bg-bg-light/50 transition">
                    <td className="px-4 py-3 font-medium text-navy">{did.did_number}</td>
                    <td className="px-4 py-3 text-text-gray">{categoryName(did.category_id)}</td>
                    <td className="px-4 py-3 text-text-gray">{did.description || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(did)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
