import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import api from '../api'

const STATUS_COLORS = {
  scheduled: 'bg-blue-50 text-blue-600',
  completed: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-stone-100 text-stone-400',
}

const empty = { patient_id: '', service_id: '', scheduled_at: '', status: 'scheduled', notes: '' }

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [services, setServices] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    load()
    api.get('/patients/').then(r => setPatients(r.data))
    api.get('/services/').then(r => setServices(r.data))
  }, [])

  async function load() {
    const { data } = await api.get('/appointments/')
    setAppointments(data)
  }

  function openNew() { setForm(empty); setEditId(null); setSaveError(''); setShowForm(true) }
  function openEdit(a) {
    const dt = new Date(a.scheduled_at)
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setForm({ patient_id: String(a.patient_id), service_id: String(a.service_id), scheduled_at: local, status: a.status, notes: a.notes || '' })
    setEditId(a.id)
    setShowForm(true)
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = { ...form, patient_id: parseInt(form.patient_id), service_id: parseInt(form.service_id), scheduled_at: new Date(form.scheduled_at).toISOString() }
    try {
      if (editId) await api.put(`/appointments/${editId}`, payload)
      else await api.post('/appointments/', payload)
      await load()
      setShowForm(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id, status) {
    await api.patch(`/appointments/${id}/status?status=${encodeURIComponent(status)}`)
    await load()
  }

  async function remove(id) {
    if (!confirm('Delete this appointment?')) return
    await api.delete(`/appointments/${id}`)
    await load()
  }

  const filtered = filterStatus === 'all' ? appointments : appointments.filter(a => a.status === filterStatus)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-stone-800 tracking-wide">Appointments</h2>
        <button onClick={openNew} className="flex items-center gap-2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors">
          <Plus size={14} /> New Appointment
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        {['all', 'scheduled', 'completed', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filterStatus === s ? 'bg-stone-800 text-white' : 'bg-white border border-stone-200 text-stone-500 hover:border-stone-300'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Date & Time</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Patient</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Price</th>
              <th className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                <td className="px-5 py-3.5 text-stone-500">
                  <span className="text-stone-700 font-medium">{new Date(a.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="text-stone-400 text-xs block">{new Date(a.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                </td>
                <td className="px-5 py-3.5 text-stone-700 font-medium">{a.patient_name}</td>
                <td className="px-5 py-3.5 text-stone-500">{a.service_name}</td>
                <td className="px-5 py-3.5 text-stone-500">${a.service_price}</td>
                <td className="px-5 py-3.5">
                  <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 ${STATUS_COLORS[a.status] || 'bg-stone-100 text-stone-500'} cursor-pointer focus:outline-none`}>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 text-right space-x-3">
                  <button onClick={() => openEdit(a)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
                  <button onClick={() => remove(a.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-stone-300 text-sm">No appointments found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/20 z-40 flex justify-end" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white w-full max-w-md h-full overflow-auto shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-medium text-stone-800">{editId ? 'Edit Appointment' : 'New Appointment'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Patient</label>
                <select value={form.patient_id} onChange={e => setForm(f => ({...f, patient_id: e.target.value}))} required
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300">
                  <option value="">Select patient…</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Service</label>
                <select value={form.service_id} onChange={e => setForm(f => ({...f, service_id: e.target.value}))} required
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300">
                  <option value="">Select service…</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Date & Time</label>
                <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))} required
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300">
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={3}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none" />
              </div>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <button type="submit" disabled={saving} className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 mt-2">
                {saving ? 'Saving…' : editId ? 'Update Appointment' : 'Book Appointment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
