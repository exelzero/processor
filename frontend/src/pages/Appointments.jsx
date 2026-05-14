import { useState } from 'react'
import { useAppointments } from '../hooks/useAppointments'
import { usePatients } from '../hooks/usePatients'
import { useServices } from '../hooks/useServices'
import PageHeader from '../components/PageHeader'
import SlidePanel from '../components/SlidePanel'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { formatDate, formatTime, formatCurrency, toDatetimeLocal } from '../utils/format'

/**
 * Appointments page — full list of all appointments with status management.
 *
 * Status can be changed inline from the table row (no panel needed), which
 * is the most common action Oksana takes — marking a session as completed
 * after the client leaves. Creating or editing an appointment opens the
 * SlidePanel with patient + service selectors.
 *
 * The page loads three hooks in parallel: appointments, patients (for the
 * dropdown), and services (for the dropdown and price display).
 */

const STATUS_FILTERS = ['all', 'scheduled', 'completed', 'cancelled']

const EMPTY_FORM = {
  patient_id: '', service_id: '', scheduled_at: '', status: 'scheduled', notes: '',
}

export default function Appointments() {
  const { appointments, loading, create, update, updateStatus, remove } = useAppointments()
  const { patients } = usePatients()
  const { services } = useServices()

  const [filterStatus, setFilterStatus] = useState('all')
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // --- Panel helpers ---

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setSaveError('')
    setPanelOpen(true)
  }

  function openEdit(appt) {
    setForm({
      patient_id: String(appt.patient_id),
      service_id: String(appt.service_id),
      scheduled_at: toDatetimeLocal(appt.scheduled_at),
      status: appt.status,
      notes: appt.notes || '',
    })
    setEditId(appt.id)
    setSaveError('')
    setPanelOpen(true)
  }

  // --- CRUD ---

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = {
      ...form,
      patient_id: parseInt(form.patient_id),
      service_id: parseInt(form.service_id),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
    }
    try {
      editId ? await update(editId, payload) : await create(payload)
      setPanelOpen(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this appointment?')) return
    await remove(id)
  }

  // Client-side status filter — all other filtering (date range, patient) can
  // be added here without touching the backend
  const filtered = filterStatus === 'all'
    ? appointments
    : appointments.filter(a => a.status === filterStatus)

  return (
    <div className="p-8">
      <PageHeader title="Appointments" action="New Appointment" onAction={openNew} />

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-5">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filterStatus === s
                ? 'bg-stone-800 text-white'
                : 'bg-white border border-stone-200 text-stone-500 hover:border-stone-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <DataTable
        columns={['Date & Time', 'Patient', 'Service', 'Price', 'Status']}
        loading={loading}
        empty="No appointments found"
      >
        {filtered.map(a => (
          <tr key={a.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
            <td className="px-5 py-3.5">
              <span className="text-stone-700 font-medium block">{formatDate(a.scheduled_at)}</span>
              <span className="text-stone-400 text-xs">{formatTime(a.scheduled_at)}</span>
            </td>
            <td className="px-5 py-3.5 text-stone-700 font-medium">{a.patient_name}</td>
            <td className="px-5 py-3.5 text-stone-500">{a.service_name}</td>
            <td className="px-5 py-3.5 text-stone-500">{formatCurrency(a.service_price)}</td>
            <td className="px-5 py-3.5">
              {/* Inline status change — most common action, no panel required */}
              <StatusBadge
                status={a.status}
                asSelect
                onChange={status => updateStatus(a.id, status)}
              />
            </td>
            <td className="px-5 py-3.5 text-right space-x-3">
              <button onClick={() => openEdit(a)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
              <button onClick={() => handleDelete(a.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
            </td>
          </tr>
        ))}
      </DataTable>

      {/* Create / Edit panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editId ? 'Edit Appointment' : 'New Appointment'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Patient</label>
            <select
              value={form.patient_id}
              onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}
              required
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="">Select patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Service</label>
            <select
              value={form.service_id}
              onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}
              required
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="">Select service…</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Date & Time</label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              required
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
            />
          </div>

          {saveError && <p className="text-red-500 text-sm">{saveError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 mt-2"
          >
            {saving ? 'Saving…' : editId ? 'Update Appointment' : 'Book Appointment'}
          </button>
        </form>
      </SlidePanel>
    </div>
  )
}
