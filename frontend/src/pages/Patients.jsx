import { useEffect, useState } from 'react'
import { Plus, X, Search } from 'lucide-react'
import api from '../api'

const SKIN_TYPES = ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive']
const empty = { first_name: '', last_name: '', email: '', phone: '', date_of_birth: '', skin_type: '', allergies: '', notes: '' }

export default function Patients() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await api.get('/patients/')
    setPatients(data)
    setLoading(false)
  }

  function openNew() { setForm(empty); setEditId(null); setSaveError(''); setShowForm(true) }
  function openEdit(p) {
    setForm({ ...p, date_of_birth: p.date_of_birth?.slice(0, 10) ?? '' })
    setEditId(p.id)
    setSaveError('')
    setShowForm(true)
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = { ...form, date_of_birth: form.date_of_birth || null }
    try {
      if (editId) await api.put(`/patients/${editId}`, payload)
      else await api.post('/patients/', payload)
      await load()
      setShowForm(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!confirm('Delete this patient?')) return
    await api.delete(`/patients/${id}`)
    await load()
  }

  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-stone-800 tracking-wide">Patients</h2>
        <button onClick={openNew} className="flex items-center gap-2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors">
          <Plus size={14} /> New Patient
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients…" className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300" />
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Name</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Email</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Phone</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Skin Type</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-stone-700">{p.first_name} {p.last_name}</td>
                <td className="px-5 py-3.5 text-stone-500">{p.email}</td>
                <td className="px-5 py-3.5 text-stone-500">{p.phone}</td>
                <td className="px-5 py-3.5 text-stone-500">{p.skin_type || '—'}</td>
                <td className="px-5 py-3.5 text-right space-x-3">
                  <button onClick={() => openEdit(p)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
                  <button onClick={() => remove(p.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {loading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-stone-300 text-sm">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-stone-300 text-sm">No patients found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-in form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/20 z-40 flex justify-end" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white w-full max-w-md h-full overflow-auto shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-medium text-stone-800">{editId ? 'Edit Patient' : 'New Patient'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" value={form.first_name} onChange={v => setForm(f => ({...f, first_name: v}))} required />
                <Field label="Last Name" value={form.last_name} onChange={v => setForm(f => ({...f, last_name: v}))} required />
              </div>
              <Field label="Email" type="email" value={form.email} onChange={v => setForm(f => ({...f, email: v}))} required />
              <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))} required />
              <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={v => setForm(f => ({...f, date_of_birth: v}))} />
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Skin Type</label>
                <select value={form.skin_type} onChange={e => setForm(f => ({...f, skin_type: e.target.value}))} className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300">
                  <option value="">Select…</option>
                  {SKIN_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <Field label="Allergies" value={form.allergies} onChange={v => setForm(f => ({...f, allergies: v}))} placeholder="e.g. Retinol, Fragrance" />
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none" />
              </div>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <button type="submit" disabled={saving} className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 mt-2">
                {saving ? 'Saving…' : editId ? 'Update Patient' : 'Create Patient'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, required, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300" />
    </div>
  )
}
