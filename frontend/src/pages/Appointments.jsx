import { useState } from 'react'
import { LayoutList, CalendarDays } from 'lucide-react'
import { useAppointments } from '../hooks/useAppointments'
import PageHeader from '../components/PageHeader'
import SlidePanel from '../components/SlidePanel'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import AppointmentCalendar from '../components/AppointmentCalendar'
import { formatDate, formatTime, formatCurrency, toDatetimeLocal } from '../utils/format'
import api from '../api'

/**
 * Appointments page — calendar and list views of all appointments.
 *
 * Two tabs let Oksana switch between:
 *   Calendar — week view (default), color-coded by service category.
 *              Click an empty slot to book, click a block to edit.
 *   List     — filterable table for bulk status updates and quick scanning.
 *
 * The booking/edit SlidePanel is shared between both views — opening it
 * from the calendar pre-fills the date and time from the clicked slot.
 *
 * Patient and service dropdowns are loaded lazily on first panel open
 * to avoid unnecessary API calls on every page visit.
 */

const STATUS_FILTERS = ['all', 'scheduled', 'completed', 'cancelled']

const EMPTY_FORM = {
  patient_id: '', service_id: '', scheduled_at: '', status: 'scheduled', notes: '',
}

export default function Appointments() {
  const { appointments, loading, create, update, updateStatus, remove } = useAppointments()

  // View toggle
  const [activeView, setActiveView] = useState('calendar')

  // List filter
  const [filterStatus, setFilterStatus] = useState('all')

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Dropdown data — fetched once on first panel open, then reused
  const [patients, setPatients] = useState([])
  const [services, setServices] = useState([])
  const [dropdownsLoaded, setDropdownsLoaded] = useState(false)

  async function loadDropdowns() {
    if (dropdownsLoaded) return
    const [p, s] = await Promise.all([api.get('/patients/'), api.get('/services/')])
    setPatients(p.data)
    setServices(s.data)
    setDropdownsLoaded(true)
  }

  // --- Panel helpers ---

  function openNew(slotInfo = null) {
    // When called from the calendar, slotInfo.start is the clicked time slot
    const prefilledTime = slotInfo?.start ? toDatetimeLocal(slotInfo.start.toISOString()) : ''
    setForm({ ...EMPTY_FORM, scheduled_at: prefilledTime })
    setEditId(null)
    setSaveError('')
    loadDropdowns()
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
    loadDropdowns()
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

  const filtered = filterStatus === 'all'
    ? appointments
    : appointments.filter(a => a.status === filterStatus)

  return (
    <div className="p-8">
      <PageHeader title="Appointments" action="New Appointment" onAction={() => openNew()} />

      {/* View toggle — Calendar / List */}
      <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 w-fit mb-5">
        <ViewTab icon={CalendarDays} label="Calendar" active={activeView === 'calendar'} onClick={() => setActiveView('calendar')} />
        <ViewTab icon={LayoutList}   label="List"     active={activeView === 'list'}     onClick={() => setActiveView('list')} />
      </div>

      {/* Calendar view */}
      {activeView === 'calendar' && (
        <AppointmentCalendar
          appointments={appointments}
          onSelectSlot={openNew}
          onSelectEvent={openEdit}
        />
      )}

      {/* List view */}
      {activeView === 'list' && (
        <>
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
        </>
      )}

      {/* Booking / Edit panel — shared between both views */}
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

/**
 * Toggle button for the Calendar / List view switcher.
 */
function ViewTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}
