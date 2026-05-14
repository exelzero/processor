import { useState } from 'react'
import { Search } from 'lucide-react'
import { usePatients } from '../hooks/usePatients'
import PageHeader from '../components/PageHeader'
import SlidePanel from '../components/SlidePanel'
import DataTable from '../components/DataTable'
import Field from '../components/Field'
import PatientDocuments from '../components/PatientDocuments'

/**
 * Patients page — searchable list of all patients with inline edit/delete.
 *
 * Patient records include intake fields (skin type, allergies, notes) that
 * Oksana fills in during or before the first consultation. The search filter
 * runs client-side against name and email since the list fits in memory.
 */

const SKIN_TYPES = ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive']

const EMPTY_FORM = {
  first_name: '', last_name: '', email: '', phone: '',
  date_of_birth: '', skin_type: '', allergies: '', notes: '',
}

export default function Patients() {
  const { patients, loading, create, update, remove } = usePatients()

  const [search, setSearch] = useState('')
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

  function openEdit(patient) {
    setForm({ ...patient, date_of_birth: patient.date_of_birth?.slice(0, 10) ?? '' })
    setEditId(patient.id)
    setSaveError('')
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
  }

  // --- CRUD ---

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = { ...form, date_of_birth: form.date_of_birth || null }
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
    if (!confirm('Delete this patient?')) return
    await remove(id)
  }

  // Client-side search across full name and email
  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <PageHeader title="Patients" action="New Patient" onAction={openNew} />

      {/* Search bar */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
        />
      </div>

      <DataTable
        columns={['Name', 'Email', 'Phone', 'Skin Type']}
        loading={loading}
        empty="No patients found"
      >
        {filtered.map(p => (
          <tr key={p.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
            <td className="px-5 py-3.5 font-medium text-stone-700">{p.first_name} {p.last_name}</td>
            <td className="px-5 py-3.5 text-stone-500">{p.email}</td>
            <td className="px-5 py-3.5 text-stone-500">{p.phone}</td>
            <td className="px-5 py-3.5 text-stone-500">{p.skin_type || '—'}</td>
            <td className="px-5 py-3.5 text-right space-x-3">
              <button onClick={() => openEdit(p)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
            </td>
          </tr>
        ))}
      </DataTable>

      {/* Create / Edit panel */}
      <SlidePanel
        open={panelOpen}
        onClose={closePanel}
        title={editId ? 'Edit Patient' : 'New Patient'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} required />
            <Field label="Last Name" value={form.last_name} onChange={v => setForm(f => ({ ...f, last_name: v }))} required />
          </div>
          <Field label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} required />
          <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} required />
          <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={v => setForm(f => ({ ...f, date_of_birth: v }))} />

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Skin Type</label>
            <select
              value={form.skin_type}
              onChange={e => setForm(f => ({ ...f, skin_type: e.target.value }))}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="">Select…</option>
              {SKIN_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <Field label="Allergies" value={form.allergies} onChange={v => setForm(f => ({ ...f, allergies: v }))} placeholder="e.g. Retinol, Fragrance" />

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
            {saving ? 'Saving…' : editId ? 'Update Patient' : 'Create Patient'}
          </button>
        </form>

        {editId && <PatientDocuments patientId={editId} />}
      </SlidePanel>
    </div>
  )
}
