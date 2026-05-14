import { useState, useEffect } from 'react'
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
 *              Click an empty slot to book; click a block to view details.
 *   List     — filterable table for bulk status updates and quick scanning.
 *
 * The SlidePanel has two modes:
 *   view — read-only appointment details with Edit / Delete actions
 *   form — create new or edit existing appointment
 */

const STATUS_FILTERS = ['all', 'scheduled', 'completed', 'cancelled', 'no-show']

const EMPTY_FORM = {
  patient_id: '', service_id: '', scheduled_at: '', status: 'scheduled', notes: '',
}

export default function Appointments() {
  const { appointments, loading, create, update, updateStatus, remove } = useAppointments()

  // View toggle
  const [activeView, setActiveView] = useState('calendar')

  // List filter
  const [filterStatus, setFilterStatus] = useState('all')

  // Panel state — 'closed' | 'view' | 'form'
  const [panelMode, setPanelMode] = useState('closed')
  const [viewAppt, setViewAppt]   = useState(null)   // appointment shown in view mode
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  // Dropdown data — loaded on page mount so they're ready before any panel opens
  const [patients, setPatients] = useState([])
  const [services, setServices] = useState([])

  useEffect(() => {
    Promise.all([api.get('/patients/'), api.get('/services/')])
      .then(([p, s]) => {
        setPatients(p.data)
        setServices(s.data)
      })
      .catch(() => {})
  }, [])

  // --- Panel helpers ---

  function closePanel() { setPanelMode('closed') }

  // Calendar block click → read-only detail view
  function openView(appt) {
    setViewAppt(appt)
    setSaveError('')
    setPanelMode('view')
  }

  // "Edit" button inside view panel, or Edit link in list row
  function openEditForm(appt) {
    setForm({
      patient_id: String(appt.patient_id),
      service_id: String(appt.service_id),
      scheduled_at: toDatetimeLocal(appt.scheduled_at),
      status: appt.status,
      notes: appt.notes || '',
    })
    setEditId(appt.id)
    setSaveError('')
    setPanelMode('form')
  }

  // New Appointment button or empty calendar slot click
  function openNew(slotInfo = null) {
    const prefilledTime = slotInfo?.start ? toDatetimeLocal(slotInfo.start.toISOString()) : ''
    setForm({ ...EMPTY_FORM, scheduled_at: prefilledTime })
    setEditId(null)
    setSaveError('')
    setPanelMode('form')
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
      closePanel()
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this appointment?')) return
    await remove(id)
    closePanel()
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
          onSelectEvent={openView}
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
                  <button onClick={() => openEditForm(a)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
                  <button onClick={() => handleDelete(a.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      {/* View panel — read-only appointment details */}
      <SlidePanel
        open={panelMode === 'view'}
        onClose={closePanel}
        title="Appointment Details"
      >
        {viewAppt && (
          <div className="space-y-5">
            <DetailRow label="Patient"   value={viewAppt.patient_name} />
            <DetailRow label="Service"   value={`${viewAppt.service_name} — ${formatCurrency(viewAppt.service_price)}`} />
            <DetailRow label="Date"      value={formatDate(viewAppt.scheduled_at)} />
            <DetailRow label="Time"      value={formatTime(viewAppt.scheduled_at)} />
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Status</p>
              <StatusBadge status={viewAppt.status} />
            </div>
            {viewAppt.notes && (
              <DetailRow label="Notes" value={viewAppt.notes} />
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => openEditForm(viewAppt)}
                className="flex-1 bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(viewAppt.id)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </SlidePanel>

      {/* Form panel — new appointment or edit existing */}
      <SlidePanel
        open={panelMode === 'form'}
        onClose={closePanel}
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
                <option key={p.id} value={String(p.id)}>{p.first_name} {p.last_name}</option>
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
                <option key={s.id} value={String(s.id)}>{s.name} — {formatCurrency(s.price)}</option>
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
              <option value="no-show">No Show</option>
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

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-stone-700">{value}</p>
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
