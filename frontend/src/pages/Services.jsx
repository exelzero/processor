import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import api from '../api'

const CATEGORIES = ['Facial', 'Treatment', 'Advanced', 'Consultation']
const empty = { name: '', description: '', price: '', duration_minutes: '', category: '', active: true }

export default function Services() {
  const [services, setServices] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await api.get('/services/')
    setServices(data)
  }

  function openNew() { setForm(empty); setEditId(null); setSaveError(''); setShowForm(true) }
  function openEdit(s) { setForm({ ...s, price: String(s.price), duration_minutes: String(s.duration_minutes) }); setEditId(s.id); setSaveError(''); setShowForm(true) }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = { ...form, price: parseFloat(form.price), duration_minutes: parseInt(form.duration_minutes) }
    try {
      if (editId) await api.put(`/services/${editId}`, payload)
      else await api.post('/services/', payload)
      await load()
      setShowForm(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!confirm('Delete this service?')) return
    await api.delete(`/services/${id}`)
    await load()
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = services.filter(s => s.category === cat)
    return acc
  }, {})
  const uncategorized = services.filter(s => !CATEGORIES.includes(s.category))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-stone-800 tracking-wide">Services</h2>
        <button onClick={openNew} className="flex items-center gap-2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors">
          <Plus size={14} /> New Service
        </button>
      </div>

      <div className="space-y-6">
        {[...CATEGORIES, uncategorized.length > 0 ? 'Other' : null].filter(Boolean).map(cat => (grouped[cat] ?? uncategorized)?.length > 0 && (
          <div key={cat}>
            <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">{cat}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(grouped[cat] ?? uncategorized).map(s => (
                <div key={s.id} className={`bg-white border rounded-xl p-5 ${s.active ? 'border-stone-200' : 'border-stone-100 opacity-50'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-stone-800 text-sm leading-tight">{s.name}</h4>
                    <span className="text-stone-800 font-medium text-sm ml-3 shrink-0">${s.price}</span>
                  </div>
                  {s.description && <p className="text-xs text-stone-400 mb-3 leading-relaxed">{s.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-stone-400">{s.duration_minutes} min</span>
                    <div className="space-x-3">
                      <button onClick={() => openEdit(s)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
                      <button onClick={() => remove(s.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/20 z-40 flex justify-end" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white w-full max-w-md h-full overflow-auto shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-medium text-stone-800">{editId ? 'Edit Service' : 'New Service'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <Field label="Service Name" value={form.name} onChange={v => setForm(f => ({...f, name: v}))} required />
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price ($)" type="number" value={form.price} onChange={v => setForm(f => ({...f, price: v}))} required />
                <Field label="Duration (min)" type="number" value={form.duration_minutes} onChange={v => setForm(f => ({...f, duration_minutes: v}))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300">
                  <option value="">Select…</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({...f, active: e.target.checked}))} className="rounded" />
                <span className="text-sm text-stone-600">Active</span>
              </label>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <button type="submit" disabled={saving} className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 mt-2">
                {saving ? 'Saving…' : editId ? 'Update Service' : 'Create Service'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300" />
    </div>
  )
}
