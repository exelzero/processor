import { useState, Fragment } from 'react'
import { ShoppingBag, Package, Tag, RotateCcw, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useSales } from '../hooks/useSales'
import { useProducts } from '../hooks/useProducts'
import { usePromotions } from '../hooks/usePromotions'
import PageHeader from '../components/PageHeader'
import SlidePanel from '../components/SlidePanel'
import Field from '../components/Field'
import { formatDate, formatCurrency } from '../utils/format'

// ── Palette / constants ───────────────────────────────────────────────────────

const TABS = ['Transactions', 'Products', 'Promotions']

const PRODUCT_CATEGORIES = ['Cleanser', 'Toner', 'Serum', 'Moisturizer', 'SPF', 'Eye Cream', 'Mask', 'Treatment', 'Other']

const SALE_STATUS_STYLES = {
  completed:           'bg-emerald-50 text-emerald-600',
  refunded:            'bg-red-50 text-red-400',
  partially_refunded:  'bg-amber-50 text-amber-600',
}

function SaleStatusBadge({ status }) {
  const style = SALE_STATUS_STYLES[status] ?? 'bg-stone-100 text-stone-400'
  const label = status === 'partially_refunded' ? 'Partial Refund' : status.replace('_', ' ')
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }) {
  const icons = [ShoppingBag, Package, Tag]
  return (
    <div className="flex border-b border-stone-200 mb-6">
      {TABS.map((tab, i) => {
        const Icon = icons[i]
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              active === tab
                ? 'border-stone-800 text-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-700 hover:border-stone-300'
            }`}
          >
            <Icon size={15} />
            {tab}
          </button>
        )
      })}
    </div>
  )
}

function LoadingRow() {
  return (
    <tr>
      <td colSpan={20} className="py-12 text-center text-stone-400 text-sm">Loading…</td>
    </tr>
  )
}

function EmptyRow({ message }) {
  return (
    <tr>
      <td colSpan={20} className="py-12 text-center text-stone-400 text-sm">{message}</td>
    </tr>
  )
}

function Th({ children, right = false }) {
  return (
    <th className={`py-3 px-4 text-xs font-semibold text-stone-400 uppercase tracking-wider border-b border-stone-100 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right = false, muted = false }) {
  return (
    <td className={`py-3 px-4 text-sm border-b border-stone-50 ${right ? 'text-right' : ''} ${muted ? 'text-stone-400' : 'text-stone-700'}`}>
      {children}
    </td>
  )
}

// ── Transactions Tab ──────────────────────────────────────────────────────────

const EMPTY_RETURN = { amount: '', reason: '', notes: '' }

function TransactionsTab() {
  const today = new Date().toISOString().slice(0, 10)
  const yearStart = today.slice(0, 4) + '-01-01'

  const [filterStatus, setFilterStatus] = useState('')
  const [filterStart, setFilterStart]   = useState(yearStart)
  const [filterEnd, setFilterEnd]       = useState(today)

  const { sales, loading, createReturn } = useSales({
    status: filterStatus,
    start: filterStart,
    end: filterEnd,
  })

  const [selected, setSelected]     = useState(null)
  const [expanded, setExpanded]     = useState(null)
  const [returnForm, setReturnForm] = useState(EMPTY_RETURN)
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')

  function openSale(sale) {
    setSelected(sale)
    setReturnForm(EMPTY_RETURN)
    setShowReturnForm(false)
    setSaveError('')
  }

  async function handleReturn(e) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setSaveError('')
    try {
      const updated = await createReturn(selected.id, {
        amount: parseFloat(returnForm.amount),
        reason: returnForm.reason || null,
        notes: returnForm.notes || null,
      })
      setSelected(updated)
      setReturnForm(EMPTY_RETURN)
      setShowReturnForm(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Failed to process return.')
    } finally {
      setSaving(false)
    }
  }

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0)
  const avgOrder     = sales.length ? totalRevenue / sales.length : 0
  const totalReturns = sales.reduce((sum, s) => sum + s.returns.reduce((r, ret) => r + ret.amount, 0), 0)

  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Transactions', value: sales.length.toLocaleString() },
          { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
          { label: 'Avg Order', value: formatCurrency(avgOrder) },
          { label: 'Total Returns', value: formatCurrency(totalReturns) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-2xl font-light text-stone-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-3 py-2 text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="partially_refunded">Partial Refund</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">From</label>
          <input
            type="date"
            value={filterStart}
            onChange={e => setFilterStart(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-3 py-2 text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">To</label>
          <input
            type="date"
            value={filterEnd}
            onChange={e => setFilterEnd(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-3 py-2 text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50">
              <Th>Date</Th>
              <Th>Patient</Th>
              <Th>Items</Th>
              <Th>Promo</Th>
              <Th right>Subtotal</Th>
              <Th right>Discount</Th>
              <Th right>Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow />}
            {!loading && sales.length === 0 && <EmptyRow message="No transactions found." />}
            {!loading && sales.map(sale => (
              <Fragment key={sale.id}>
                <tr
                  className="hover:bg-stone-50 cursor-pointer transition-colors"
                  onClick={() => setExpanded(prev => prev === sale.id ? null : sale.id)}
                >
                  <Td muted>{formatDate(sale.sale_date)}</Td>
                  <Td>{sale.patient_name}</Td>
                  <Td muted>
                    <span className="flex items-center gap-1">
                      {sale.items.length}
                      {expanded === sale.id
                        ? <ChevronUp size={12} className="text-stone-400" />
                        : <ChevronDown size={12} className="text-stone-400" />}
                    </span>
                  </Td>
                  <Td muted>{sale.promo_code ?? '—'}</Td>
                  <Td right muted>{formatCurrency(sale.subtotal)}</Td>
                  <Td right muted>{sale.discount_amount > 0 ? `−${formatCurrency(sale.discount_amount)}` : '—'}</Td>
                  <Td right><span className="font-medium text-stone-800">{formatCurrency(sale.total)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <SaleStatusBadge status={sale.status} />
                      <button
                        onClick={e => { e.stopPropagation(); openSale(sale) }}
                        className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
                      >
                        Details
                      </button>
                    </div>
                  </Td>
                </tr>
                {expanded === sale.id && (
                  <tr className="bg-stone-50">
                    <td colSpan={8} className="px-6 pb-4">
                      <div className="text-xs text-stone-500 space-y-1 pt-1">
                        {sale.items.map(item => (
                          <div key={item.id} className="flex justify-between">
                            <span>{item.product_name} <span className="text-stone-400">× {item.quantity} @ {formatCurrency(item.unit_price)}</span></span>
                            <span>{formatCurrency(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sale detail panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Sale Details"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-stone-400 mb-0.5">Date</p>
                <p className="text-stone-700">{formatDate(selected.sale_date)}</p>
              </div>
              <div>
                <p className="text-xs text-stone-400 mb-0.5">Status</p>
                <SaleStatusBadge status={selected.status} />
              </div>
              <div>
                <p className="text-xs text-stone-400 mb-0.5">Patient</p>
                <p className="text-stone-700">{selected.patient_name}</p>
              </div>
              <div>
                <p className="text-xs text-stone-400 mb-0.5">Promo</p>
                <p className="text-stone-700">{selected.promo_code ?? '—'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">Items</p>
              <div className="space-y-1.5">
                {selected.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div>
                      <span className="text-stone-700">{item.product_name}</span>
                      <span className="text-stone-400 ml-1 text-xs">× {item.quantity} @ {formatCurrency(item.unit_price)}</span>
                    </div>
                    <span className="text-stone-700 font-medium">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-stone-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-stone-500">
                <span>Subtotal</span>
                <span>{formatCurrency(selected.subtotal)}</span>
              </div>
              {selected.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>−{formatCurrency(selected.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium text-stone-800 text-base pt-1">
                <span>Total</span>
                <span>{formatCurrency(selected.total)}</span>
              </div>
            </div>

            {selected.returns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <RotateCcw size={11} /> Returns
                </p>
                <div className="space-y-1.5">
                  {selected.returns.map(r => (
                    <div key={r.id} className="flex justify-between text-sm">
                      <div>
                        <span className="text-stone-500">{formatDate(r.return_date)}</span>
                        {r.reason && <span className="text-stone-400 ml-1 text-xs">· {r.reason}</span>}
                      </div>
                      <span className="text-red-500 font-medium">−{formatCurrency(r.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.notes && (
              <div>
                <p className="text-xs text-stone-400 mb-0.5">Notes</p>
                <p className="text-sm text-stone-600">{selected.notes}</p>
              </div>
            )}

            {selected.status !== 'refunded' && (
              <div className="border-t border-stone-100 pt-4">
                {!showReturnForm ? (
                  <button
                    onClick={() => setShowReturnForm(true)}
                    className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <RotateCcw size={14} />
                    Process Return
                  </button>
                ) : (
                  <form onSubmit={handleReturn} className="space-y-3">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Process Return</p>
                    <Field label="Amount ($)">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={selected.total}
                        value={returnForm.amount}
                        onChange={e => setReturnForm(f => ({ ...f, amount: e.target.value }))}
                        required
                        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300"
                        placeholder={`Max ${formatCurrency(selected.total)}`}
                      />
                    </Field>
                    <Field label="Reason">
                      <input
                        type="text"
                        value={returnForm.reason}
                        onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))}
                        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300"
                        placeholder="Optional"
                      />
                    </Field>
                    <Field label="Notes">
                      <textarea
                        value={returnForm.notes}
                        onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))}
                        rows={2}
                        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
                        placeholder="Optional"
                      />
                    </Field>
                    {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 bg-stone-800 text-white text-sm py-2 rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Processing…' : 'Confirm Return'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReturnForm(false)}
                        className="px-4 text-sm text-stone-500 hover:text-stone-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </SlidePanel>
    </>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────────

const EMPTY_PRODUCT = {
  name: '', brand: '', description: '', category: '', price: '', cost: '', sku: '', active: true,
}

function ProductsTab() {
  const { products, loading, create, update, remove, placeOrder, receiveOrder, adjust } = useProducts()

  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm]           = useState(EMPTY_PRODUCT)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Stock action panel state
  const [stockPanel, setStockPanel]       = useState(null)  // { mode: 'order'|'receive'|'adjust', product }
  const [stockQty, setStockQty]           = useState('')
  const [stockNotes, setStockNotes]       = useState('')
  const [stockSaving, setStockSaving]     = useState(false)
  const [stockError, setStockError]       = useState('')

  function openNew() {
    setForm(EMPTY_PRODUCT)
    setEditId(null)
    setSaveError('')
    setPanelOpen(true)
  }

  function openEdit(p) {
    setForm({
      name: p.name, brand: p.brand, description: p.description ?? '',
      category: p.category, price: String(p.price), cost: p.cost ? String(p.cost) : '',
      sku: p.sku, active: p.active,
    })
    setEditId(p.id)
    setSaveError('')
    setPanelOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = {
      ...form,
      price: parseFloat(form.price),
      cost: form.cost ? parseFloat(form.cost) : null,
    }
    try {
      editId ? await update(editId, payload) : await create(payload)
      setPanelOpen(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Deactivate this product? It will no longer appear in new sales.')) return
    await remove(id)
  }

  function openStockPanel(mode, product) {
    // Re-read from live products state so the summary reflects the latest stock figures.
    const fresh = products.find(p => p.id === product.id) ?? product
    setStockPanel({ mode, product: fresh })
    setStockQty('')
    setStockNotes('')
    setStockError('')
  }

  async function handleStockAction() {
    const qty = parseInt(stockQty, 10)
    const isOrderOrReceive = stockPanel.mode === 'order' || stockPanel.mode === 'receive'
    if (isNaN(qty) || qty === 0) { setStockError('Enter a valid non-zero quantity.'); return }
    if (isOrderOrReceive && qty < 1) { setStockError(qty < 0 ? 'Quantity cannot be negative.' : 'Quantity must be at least 1.'); return }
    setStockSaving(true)
    setStockError('')
    try {
      if (stockPanel.mode === 'order')   await placeOrder(stockPanel.product.id, qty, stockNotes || null)
      if (stockPanel.mode === 'receive') await receiveOrder(stockPanel.product.id, qty, stockNotes || null)
      if (stockPanel.mode === 'adjust')  await adjust(stockPanel.product.id, qty, stockNotes || null)
      setStockPanel(null)
    } catch (err) {
      setStockError(err.response?.data?.detail ?? 'Something went wrong.')
    } finally {
      setStockSaving(false)
    }
  }

  const visible = showInactive ? products : products.filter(p => p.active)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <label className="flex items-center gap-2 text-sm text-stone-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-stone-300"
          />
          Show inactive
        </label>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={14} />
          Add Product
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50">
              <Th>SKU</Th>
              <Th>Name</Th>
              <Th>Brand</Th>
              <Th>Category</Th>
              <Th right>Price</Th>
              <Th right>Cost</Th>
              <Th right>In Stock</Th>
              <Th right>On Order</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow />}
            {!loading && visible.length === 0 && <EmptyRow message="No products found." />}
            {!loading && visible.map(p => (
              <tr key={p.id} className={`hover:bg-stone-50 transition-colors ${!p.active ? 'opacity-50' : ''}`}>
                <Td muted><code className="text-xs">{p.sku}</code></Td>
                <Td>{p.name}</Td>
                <Td muted>{p.brand}</Td>
                <Td muted>{p.category}</Td>
                <Td right>{formatCurrency(p.price)}</Td>
                <Td right muted>{p.cost ? formatCurrency(p.cost) : '—'}</Td>
                <Td right>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.stock_qty <= 0 ? 'bg-red-50 text-red-500'
                    : p.stock_qty <= 3 ? 'bg-amber-50 text-amber-600'
                    : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {p.stock_qty}
                  </span>
                </Td>
                <Td right>
                  {p.stock_on_order > 0
                    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">{p.stock_on_order}</span>
                    : <span className="text-stone-300 text-xs">—</span>}
                </Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.active ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(p)} className="text-xs text-stone-400 hover:text-stone-700 transition-colors">Edit</button>
                    {p.active && (<>
                      <button onClick={() => openStockPanel('order', p)} className="text-xs text-stone-400 hover:text-sky-600 transition-colors">Order</button>
                      {p.stock_on_order > 0 && <button onClick={() => openStockPanel('receive', p)} className="text-xs text-stone-400 hover:text-emerald-600 transition-colors">Receive</button>}
                      <button onClick={() => openStockPanel('adjust', p)} className="text-xs text-stone-400 hover:text-amber-600 transition-colors">Adjust</button>
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-stone-400 hover:text-red-500 transition-colors">Deactivate</button>
                    </>)}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editId ? 'Edit Product' : 'Add Product'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Name">
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
          </Field>
          <Field label="Brand">
            <input type="text" required value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
          </Field>
          <Field label="Category">
            <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300">
              <option value="">Select…</option>
              {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="SKU">
            <input type="text" required value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300 font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)">
              <input type="number" step="0.01" min="0" required value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
            </Field>
            <Field label="Cost ($)">
              <input type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" placeholder="Optional" />
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none" placeholder="Optional" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="rounded border-stone-300" />
            Active
          </label>
          {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-stone-800 text-white text-sm py-2.5 rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Product'}
          </button>
        </form>
      </SlidePanel>

      {/* Stock action panel */}
      <SlidePanel
        open={!!stockPanel}
        onClose={() => setStockPanel(null)}
        title={
          stockPanel?.mode === 'order'   ? `Order Stock — ${stockPanel.product.name}`   :
          stockPanel?.mode === 'receive' ? `Receive Order — ${stockPanel.product.name}` :
          stockPanel                     ? `Adjust Stock — ${stockPanel.product.name}`  : ''
        }
      >
        {stockPanel && (
          <div className="space-y-4">
            {/* Current stock summary */}
            <div className="flex gap-4 p-3 bg-stone-50 rounded-lg text-sm">
              <div className="text-center">
                <div className="font-medium text-stone-800">{stockPanel.product.stock_qty}</div>
                <div className="text-stone-400 text-xs">In Stock</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-sky-600">{stockPanel.product.stock_on_order}</div>
                <div className="text-stone-400 text-xs">On Order</div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                {stockPanel.mode === 'adjust' ? 'Delta (+ add / − remove)' : 'Quantity'}
              </label>
              <input
                type="number"
                value={stockQty}
                onChange={e => setStockQty(e.target.value)}
                min={stockPanel.mode === 'adjust' ? undefined : 1}
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                placeholder={stockPanel.mode === 'adjust' ? 'e.g. −2 for damage' : 'e.g. 12'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
              <textarea
                value={stockNotes}
                onChange={e => setStockNotes(e.target.value)}
                rows={2}
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
                placeholder={
                  stockPanel.mode === 'order'   ? 'Supplier, PO number…' :
                  stockPanel.mode === 'receive' ? 'Delivery ref…' :
                                                  'Reason for adjustment…'
                }
              />
            </div>

            {stockError && <p className="text-sm text-red-500">{stockError}</p>}

            <button
              onClick={handleStockAction}
              disabled={stockSaving}
              className="w-full py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
            >
              {stockSaving ? 'Saving…' :
                stockPanel.mode === 'order'   ? 'Place Order' :
                stockPanel.mode === 'receive' ? 'Mark Received' :
                                                'Apply Adjustment'}
            </button>
          </div>
        )}
      </SlidePanel>
    </>
  )
}

// ── Promotions Tab ────────────────────────────────────────────────────────────

const EMPTY_PROMO = {
  name: '', code: '', discount_type: 'percentage', discount_value: '',
  min_purchase: '', start_date: '', end_date: '', active: true, max_uses: '',
}

function PromotionsTab() {
  const { promotions, loading, create, update, deactivate } = usePromotions()

  const [panelOpen, setPanelOpen]   = useState(false)
  const [form, setForm]             = useState(EMPTY_PROMO)
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [showExpired, setShowExpired] = useState(false)

  function openNew() {
    setForm(EMPTY_PROMO)
    setEditId(null)
    setSaveError('')
    setPanelOpen(true)
  }

  function openEdit(p) {
    setForm({
      name: p.name, code: p.code,
      discount_type: p.discount_type, discount_value: String(p.discount_value),
      min_purchase: p.min_purchase ? String(p.min_purchase) : '',
      start_date: p.start_date.slice(0, 16),
      end_date: p.end_date.slice(0, 16),
      active: p.active, max_uses: p.max_uses ? String(p.max_uses) : '',
    })
    setEditId(p.id)
    setSaveError('')
    setPanelOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = {
      name: form.name,
      code: form.code,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      min_purchase: form.min_purchase ? parseFloat(form.min_purchase) : null,
      start_date: form.start_date,
      end_date: form.end_date,
      active: form.active,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
    }
    try {
      editId ? await update(editId, payload) : await create(payload)
      setPanelOpen(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('Deactivate this promotion? It can be re-enabled by editing.')) return
    await deactivate(id)
  }

  const visible = showExpired ? promotions : promotions.filter(p => p.active && new Date().toISOString() <= p.end_date)

  function promoStatus(p) {
    const now = new Date().toISOString()
    if (!p.active) return { label: 'Inactive', style: 'bg-stone-100 text-stone-400' }
    if (now < p.start_date) return { label: 'Upcoming', style: 'bg-blue-50 text-blue-500' }
    if (now > p.end_date)   return { label: 'Expired', style: 'bg-red-50 text-red-400' }
    return { label: 'Active', style: 'bg-emerald-50 text-emerald-600' }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <label className="flex items-center gap-2 text-sm text-stone-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showExpired}
            onChange={e => setShowExpired(e.target.checked)}
            className="rounded border-stone-300"
          />
          Show inactive / expired
        </label>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={14} />
          New Promo
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50">
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th right>Value</Th>
              <Th right>Min Purchase</Th>
              <Th right>Uses</Th>
              <Th>Valid Period</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow />}
            {!loading && visible.length === 0 && <EmptyRow message="No promotions found." />}
            {!loading && visible.map(p => {
              const status = promoStatus(p)
              return (
                <tr key={p.id} className={`hover:bg-stone-50 transition-colors ${!p.active ? 'opacity-50' : ''}`}>
                  <Td><code className="text-xs font-mono bg-stone-50 px-1.5 py-0.5 rounded">{p.code}</code></Td>
                  <Td>{p.name}</Td>
                  <Td muted className="capitalize">{p.discount_type}</Td>
                  <Td right>
                    {p.discount_type === 'percentage'
                      ? `${p.discount_value}%`
                      : formatCurrency(p.discount_value)}
                  </Td>
                  <Td right muted>{p.min_purchase ? formatCurrency(p.min_purchase) : '—'}</Td>
                  <Td right muted>
                    {p.uses_count}
                    {p.max_uses ? <span className="text-stone-300"> / {p.max_uses}</span> : ''}
                  </Td>
                  <Td muted>
                    <span className="text-xs whitespace-nowrap">
                      {p.start_date.slice(0, 10)} → {p.end_date.slice(0, 10)}
                    </span>
                  </Td>
                  <Td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.style}`}>
                      {status.label}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(p)} className="text-xs text-stone-400 hover:text-stone-700 transition-colors">Edit</button>
                      {p.active && (
                        <button onClick={() => handleDeactivate(p.id)} className="text-xs text-stone-400 hover:text-red-500 transition-colors">Deactivate</button>
                      )}
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editId ? 'Edit Promotion' : 'New Promotion'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Promotion Name">
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
          </Field>
          <Field label="Code">
            <input type="text" required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300 font-mono uppercase tracking-widest" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount Type">
              <select required value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
            </Field>
            <Field label={form.discount_type === 'percentage' ? 'Value (%)' : 'Value ($)'}>
              <input type="number" step="0.01" min="0" required value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Purchase ($)">
              <input type="number" step="0.01" min="0" value={form.min_purchase}
                onChange={e => setForm(f => ({ ...f, min_purchase: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" placeholder="None" />
            </Field>
            <Field label="Max Uses">
              <input type="number" min="1" value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" placeholder="Unlimited" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="datetime-local" required value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
            </Field>
            <Field label="End Date">
              <input type="datetime-local" required value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="rounded border-stone-300" />
            Active
          </label>
          {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-stone-800 text-white text-sm py-2.5 rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Promotion'}
          </button>
        </form>
      </SlidePanel>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Sales() {
  const [activeTab, setActiveTab] = useState('Transactions')

  return (
    <div className="p-8">
      <PageHeader title="Sales" subtitle="Transactions, products, and promotions" />
      <TabBar active={activeTab} onChange={setActiveTab} />
      {activeTab === 'Transactions' && <TransactionsTab />}
      {activeTab === 'Products'     && <ProductsTab />}
      {activeTab === 'Promotions'   && <PromotionsTab />}
    </div>
  )
}
