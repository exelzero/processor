import { useState } from 'react'
import { useServices } from '../hooks/useServices'
import PageHeader from '../components/PageHeader'
import SlidePanel from '../components/SlidePanel'
import Field from '../components/Field'

/**
 * Services page — the treatment catalogue for OK Beauty Space.
 *
 * Services are grouped by category so Oksana can quickly scan by treatment
 * type (Facial, Treatment, Advanced, Consultation). Any service whose
 * category doesn't match the known list falls into an 'Other' bucket
 * instead of silently disappearing.
 *
 * Pricing and duration are managed here and flow through to Appointments
 * automatically — no need to update both places.
 */

const CATEGORIES = ['Facial', 'Treatment', 'Advanced', 'Consultation']

const EMPTY_FORM = {
  name: '', description: '', price: '', duration_minutes: '', category: '', active: true,
}

export default function Services() {
  const { services, loading, create, update, remove } = useServices()

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

  function openEdit(service) {
    setForm({ ...service, price: String(service.price), duration_minutes: String(service.duration_minutes) })
    setEditId(service.id)
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
      price: parseFloat(form.price),
      duration_minutes: parseInt(form.duration_minutes),
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
    if (!confirm('Delete this service?')) return
    await remove(id)
  }

  // Group by category. Services outside the known categories go to 'Other'.
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = services.filter(s => s.category === cat)
    return acc
  }, {})
  const uncategorized = services.filter(s => !CATEGORIES.includes(s.category))
  const displayCategories = uncategorized.length > 0 ? [...CATEGORIES, 'Other'] : CATEGORIES

  return (
    <div className="p-8">
      <PageHeader title="Services" action="New Service" onAction={openNew} />

      {loading && <p className="text-stone-300 text-sm">Loading…</p>}

      <div className="space-y-6">
        {displayCategories.map(cat => {
          const items = cat === 'Other' ? uncategorized : grouped[cat]
          if (!items?.length) return null
          return (
            <div key={cat}>
              <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">{cat}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map(s => (
                  <div
                    key={s.id}
                    className={`bg-white border rounded-xl p-5 ${s.active ? 'border-stone-200' : 'border-stone-100 opacity-50'}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-stone-800 text-sm leading-tight">{s.name}</h4>
                      <span className="text-stone-800 font-medium text-sm ml-3 shrink-0">${s.price}</span>
                    </div>
                    {s.description && (
                      <p className="text-xs text-stone-400 mb-3 leading-relaxed">{s.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-stone-400">{s.duration_minutes} min</span>
                      <div className="space-x-3">
                        <button onClick={() => openEdit(s)} className="text-stone-400 hover:text-stone-700 text-xs">Edit</button>
                        <button onClick={() => handleDelete(s.id)} className="text-stone-400 hover:text-red-500 text-xs">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create / Edit panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editId ? 'Edit Service' : 'New Service'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Service Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)" type="number" value={form.price} onChange={v => setForm(f => ({ ...f, price: v }))} required />
            <Field label="Duration (min)" type="number" value={form.duration_minutes} onChange={v => setForm(f => ({ ...f, duration_minutes: v }))} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-stone-600">Active</span>
          </label>

          {saveError && <p className="text-red-500 text-sm">{saveError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 mt-2"
          >
            {saving ? 'Saving…' : editId ? 'Update Service' : 'Create Service'}
          </button>
        </form>
      </SlidePanel>
    </div>
  )
}
