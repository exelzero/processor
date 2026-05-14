import { useState, useEffect } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useExpenses } from '../hooks/useExpenses'
import api from '../api'
import PageHeader from '../components/PageHeader'
import SlidePanel from '../components/SlidePanel'
import Field from '../components/Field'
import DataTable from '../components/DataTable'
import { formatDate, formatCurrency } from '../utils/format'

function monthOptions() {
  const opts = []
  const now = new Date()
  for (let i = 8; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    opts.push({ val, label })
  }
  return opts
}

const CATEGORY_COLORS = {
  'Rent':                     'bg-violet-50 text-violet-600',
  'Utilities':                'bg-sky-50 text-sky-600',
  'Products & Supplies':      'bg-emerald-50 text-emerald-600',
  'Equipment':                'bg-amber-50 text-amber-700',
  'Marketing':                'bg-pink-50 text-pink-600',
  'Insurance':                'bg-indigo-50 text-indigo-600',
  'Software & Subscriptions': 'bg-teal-50 text-teal-600',
  'Cleaning':                 'bg-lime-50 text-lime-700',
  'Miscellaneous':            'bg-stone-100 text-stone-500',
}

function CategoryBadge({ category }) {
  const cls = CATEGORY_COLORS[category] ?? 'bg-stone-100 text-stone-500'
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>
      {category}
    </span>
  )
}

const BLANK = { category: '', description: '', amount: '', expense_date: '', notes: '' }

export default function Expenses() {
  const { expenses, loading, error, load, create, update, remove } = useExpenses()

  const [categories, setCategories] = useState([])
  const [filterCat, setFilterCat] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    api.get('/expenses/categories')
      .then(r => setCategories(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load({ category: filterCat || undefined, month: filterMonth || undefined })
  }, [load, filterCat, filterMonth])

  function openCreate() {
    setEditId(null)
    setForm(BLANK)
    setFormError(null)
    setPanelOpen(true)
  }

  function openEdit(exp) {
    setEditId(exp.id)
    setForm({
      category: exp.category,
      description: exp.description,
      amount: String(exp.amount),
      expense_date: exp.expense_date,
      notes: exp.notes ?? '',
    })
    setFormError(null)
    setPanelOpen(true)
  }

  async function handleSave() {
    setFormError(null)
    if (!form.category || !form.description || !form.amount || !form.expense_date) {
      setFormError('Category, description, amount and date are required.')
      return
    }
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt <= 0) {
      setFormError('Amount must be a number greater than zero.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        category: form.category,
        description: form.description,
        amount: amt,
        expense_date: form.expense_date,
        notes: form.notes || null,
      }
      if (editId) {
        await update(editId, payload)
      } else {
        await create(payload)
      }
      setPanelOpen(false)
      load({ category: filterCat || undefined, month: filterMonth || undefined })
    } catch (e) {
      const detail = e.response?.data?.detail
      setFormError(
        Array.isArray(detail)
          ? detail.map(d => d.msg).join('; ')
          : detail ?? e.message
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense?')) return
    try {
      await remove(id)
      load({ category: filterCat || undefined, month: filterMonth || undefined })
    } catch {
      alert('Delete failed. Please try again.')
    }
  }

  const totalShown = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const moOpts = monthOptions()

  return (
    <div className="p-8 h-full flex flex-col min-h-0">
      <PageHeader
        title="Expenses"
        action="Add Expense"
        onAction={openCreate}
      />

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
        >
          <option value="">All Months</option>
          {moOpts.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>

        {expenses.length > 0 && (
          <span className="ml-auto text-sm text-stone-500">
            {expenses.length} record{expenses.length !== 1 ? 's' : ''}&nbsp;·&nbsp;
            <span className="font-medium text-stone-800">{formatCurrency(totalShown)}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      <DataTable
        columns={['Date', 'Category', 'Description', 'Notes', 'Amount']}
        loading={loading}
        empty="No expenses found"
      >
        {expenses.map(exp => (
          <tr key={exp.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
            <td className="px-5 py-3.5 text-stone-500 whitespace-nowrap">{formatDate(exp.expense_date)}</td>
            <td className="px-5 py-3.5"><CategoryBadge category={exp.category} /></td>
            <td className="px-5 py-3.5 text-stone-700">{exp.description}</td>
            <td className="px-5 py-3.5 text-stone-400 text-sm">{exp.notes ?? '—'}</td>
            <td className="px-5 py-3.5 font-medium text-stone-900 whitespace-nowrap">{formatCurrency(exp.amount)}</td>
            <td className="px-5 py-3.5 text-right">
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => openEdit(exp)}
                  className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(exp.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editId ? 'Edit Expense' : 'Add Expense'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="">Select category…</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <Field
            label="Description"
            value={form.description}
            onChange={v => setForm(f => ({ ...f, description: v }))}
            placeholder="Brief description"
          />

          <Field
            label="Amount ($)"
            type="number"
            value={form.amount}
            onChange={v => setForm(f => ({ ...f, amount: v }))}
            placeholder="0.00"
          />

          <Field
            label="Date"
            type="date"
            value={form.expense_date}
            onChange={v => setForm(f => ({ ...f, expense_date: v }))}
          />

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
              placeholder="Any additional details…"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </SlidePanel>
    </div>
  )
}
