import { useId, useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart, Line,
  LineChart,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useAnalytics } from '../hooks/useAnalytics'
import { formatCurrency } from '../utils/format'

// ── Palette ──────────────────────────────────────────────────────────────────
const STONE   = '#292524'
const STONE_3 = '#d6d3d1'
const EMERALD = '#10b981'
const BLUE    = '#60a5fa'
const RED     = '#f87171'
const AMBER   = '#fbbf24'

const CATEGORY_COLORS = {
  Advanced:     '#292524',
  Facial:       '#78716c',
  Treatment:    '#a8a29e',
  Consultation: '#d6d3d1',
}

const SKIN_COLORS     = ['#292524', '#57534e', '#78716c', '#a8a29e', '#d6d3d1']
const EXPENSE_COLORS  = ['#292524', '#57534e', '#78716c', '#a8a29e', '#d6d3d1', '#44403c', '#1c1917', '#e7e5e4', '#c7c4c0']

const MONTH_SHORT = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}
function shortMonth(yearMonth) {
  if (!yearMonth) return ''
  return MONTH_SHORT[yearMonth.split('-')[1]] ?? yearMonth
}

// ── Shared chart config ───────────────────────────────────────────────────────
const AXIS_STYLE    = { fontSize: 11, fill: '#a8a29e' }
const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }

// ── Small shared components ───────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-10 first:mt-0">
      <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest whitespace-nowrap">{children}</h2>
      <div className="flex-1 h-px bg-stone-100" />
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-stone-200 rounded-xl p-6 ${className}`}>
      {children}
    </div>
  )
}

function CardTitle({ children }) {
  return (
    <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-4">{children}</p>
  )
}

function KpiCard({ label, value, sub }) {
  return (
    <Card>
      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-light text-stone-800">{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
    </Card>
  )
}

function Empty({ loading }) {
  return (
    <p className="text-stone-300 text-sm">{loading ? 'Loading…' : 'No data yet'}</p>
  )
}

const PERIODS = [
  { value: 'ytd', label: 'Year to Date' },
  { value: '30d', label: '30 days' },
  { value: '60d', label: '60 days' },
  { value: '90d', label: '90 days' },
  { value: '120d', label: '120 days' },
]

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [period, setPeriod] = useState('ytd')
  const {
    revenueTrend, categoryMix, statusTrend, schedulePatterns, servicePerf, clientInsights,
    productSales, expensesData, inventoryData,
    loading, error,
  } = useAnalytics(period)
  const gradientId = useId()

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-light text-stone-800 mb-4 tracking-wide">Analytics</h1>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    )
  }

  // Derived values
  const totalRevenue = revenueTrend.by_month.reduce((s, r) => s + r.revenue, 0)
  const { cancellation_rate, no_show_rate } = statusTrend
  const completionRate = (() => {
    const past = statusTrend.by_month.reduce((s, r) => s + r.completed + r.cancelled + r['no-show'], 0)
    const done = statusTrend.by_month.reduce((s, r) => s + r.completed, 0)
    return past > 0 ? Math.round((done / past) * 100) : 0
  })()

  const monthChartData  = revenueTrend.by_month.map(r => ({ ...r, label: shortMonth(r.month) }))
  const statusChartData = statusTrend.by_month.map(r => ({ ...r, label: shortMonth(r.month) }))
  const topServicesByCount = [...servicePerf].sort((a, b) => b.count - a.count).slice(0, 8)
  const retentionData = clientInsights.retention.one_time != null
    ? [
        { name: 'Returning',  value: clientInsights.retention.returning },
        { name: 'First-time', value: clientInsights.retention.one_time },
      ]
    : []

  const productMonthData    = productSales.by_month.map(r => ({ ...r, label: shortMonth(r.month) }))
  const expenseMonthData    = expensesData.by_month.map(r => ({ ...r, label: shortMonth(r.month) }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-light text-stone-800 tracking-wide">Analytics</h1>
        <div className="flex items-center gap-1.5">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                period === p.value
                  ? 'bg-stone-800 text-white'
                  : 'text-stone-400 border border-stone-200 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Service Revenue"
          value={loading ? '—' : formatCurrency(totalRevenue)}
          sub="completed appointments"
        />
        <KpiCard
          label="Product Revenue"
          value={loading ? '—' : formatCurrency(productSales.total_revenue)}
          sub={`${productSales.total_transactions} transactions`}
        />
        <KpiCard
          label="Total Expenses"
          value={loading ? '—' : formatCurrency(expensesData.total)}
          sub={expensesData.top_category ? `largest: ${expensesData.top_category}` : undefined}
        />
        <KpiCard
          label="Client Retention"
          value={loading ? '—' : `${clientInsights.retention.returning ?? 0}`}
          sub="returning clients"
        />
      </div>

      {/* ── Revenue ─────────────────────────────────────────────────────────── */}
      <SectionTitle>Revenue</SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardTitle>Monthly Revenue &amp; Volume</CardTitle>
          {monthChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={STONE} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={STONE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis yAxisId="rev" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="cnt" orientation="right" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => name === 'revenue' ? [formatCurrency(v), 'Revenue'] : [v, 'Appointments']}
                />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke={STONE} strokeWidth={2} fill={`url(#${gradientId})`} dot={{ r: 3, fill: STONE, strokeWidth: 0 }} activeDot={{ r: 5, fill: STONE, strokeWidth: 0 }} />
                <Line yAxisId="cnt" type="monotone" dataKey="count" stroke={AMBER} strokeWidth={2} dot={{ r: 3, fill: AMBER, strokeWidth: 0 }} activeDot={{ r: 5, fill: AMBER, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Revenue by Category</CardTitle>
          {categoryMix.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={categoryMix} dataKey="revenue" nameKey="category" cx="50%" cy="50%" innerRadius={45} outerRadius={72} strokeWidth={0}>
                    {categoryMix.map(entry => (
                      <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? STONE_3} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [formatCurrency(v), 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {categoryMix.map(entry => (
                  <div key={entry.category} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CATEGORY_COLORS[entry.category] ?? STONE_3 }} />
                      <span className="text-stone-600">{entry.category}</span>
                    </span>
                    <span className="text-stone-400">{formatCurrency(entry.revenue)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Appointments ────────────────────────────────────────────────────── */}
      <SectionTitle>Appointments</SectionTitle>

      <Card className="mb-6">
        <CardTitle>Appointment Status by Month</CardTitle>
        {statusChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f5f4" />
              <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Bar dataKey="completed" stackId="a" fill={EMERALD} name="Completed" />
              <Bar dataKey="cancelled" stackId="a" fill={STONE_3} name="Cancelled" />
              <Bar dataKey="no-show"   stackId="a" fill={RED}     name="No-show" />
              <Bar dataKey="scheduled" stackId="a" fill={BLUE}    radius={[4, 4, 0, 0]} name="Scheduled" />
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty loading={loading} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardTitle>Busiest Day of Week</CardTitle>
          {schedulePatterns.by_weekday.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={schedulePatterns.by_weekday} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="day" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Appointments']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {schedulePatterns.by_weekday.map((entry, i, arr) => {
                    const max = Math.max(...arr.map(d => d.count))
                    return <Cell key={entry.day} fill={entry.count === max ? STONE : STONE_3} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Busiest Hour of Day</CardTitle>
          {schedulePatterns.by_hour.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={schedulePatterns.by_hour} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="hour" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Appointments']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {schedulePatterns.by_hour.map((entry, i, arr) => {
                    const max = Math.max(...arr.map(d => d.count))
                    return <Cell key={entry.hour} fill={entry.count === max ? STONE : STONE_3} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Services ────────────────────────────────────────────────────────── */}
      <SectionTitle>Services</SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardTitle>Top Services by Revenue</CardTitle>
          {servicePerf.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={servicePerf} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {servicePerf.map((_, i) => <Cell key={i} fill={i === 0 ? STONE : STONE_3} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Top Services by Bookings</CardTitle>
          {topServicesByCount.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topServicesByCount} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Bookings']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {topServicesByCount.map((_, i) => <Cell key={i} fill={i === 0 ? STONE : STONE_3} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Clients ─────────────────────────────────────────────────────────── */}
      <SectionTitle>Clients</SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardTitle>New Client Acquisition by Month</CardTitle>
          {clientInsights.growth.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={clientInsights.growth.map(r => ({ ...r, label: shortMonth(r.month) }))} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis yAxisId="new" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis yAxisId="cum" orientation="right" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [v, name === 'new_clients' ? 'New clients' : 'Total clients']} />
                <Bar yAxisId="new" dataKey="new_clients" fill={STONE_3} radius={[4, 4, 0, 0]} name="new_clients" />
                <Line yAxisId="cum" type="monotone" dataKey="cumulative" stroke={STONE} strokeWidth={2} dot={false} name="cumulative" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Client Retention</CardTitle>
          {retentionData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={retentionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={64} strokeWidth={0}>
                    <Cell fill={STONE} />
                    <Cell fill={STONE_3} />
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {retentionData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: i === 0 ? STONE : STONE_3 }} />
                      <span className="text-stone-600">{entry.name}</span>
                    </span>
                    <span className="text-stone-400">{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardTitle>Skin Type Distribution</CardTitle>
          {clientInsights.skin_types.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={clientInsights.skin_types} dataKey="count" nameKey="skin_type" cx="50%" cy="50%" innerRadius={40} outerRadius={64} strokeWidth={0}>
                    {clientInsights.skin_types.map((_, i) => (
                      <Cell key={i} fill={SKIN_COLORS[i % SKIN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Clients']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {clientInsights.skin_types.map((entry, i) => (
                  <div key={entry.skin_type} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: SKIN_COLORS[i % SKIN_COLORS.length] }} />
                      <span className="text-stone-600">{entry.skin_type}</span>
                    </span>
                    <span className="text-stone-400">{entry.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty loading={loading} />}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Top 10 Clients by Revenue</CardTitle>
          {clientInsights.top_clients.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-400 uppercase tracking-wider text-left border-b border-stone-100">
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium text-right">Visits</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {clientInsights.top_clients.map((c, i) => (
                  <tr key={c.name} className="border-b border-stone-50 last:border-0">
                    <td className="py-2 text-stone-700">
                      <span className="text-stone-300 mr-2 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      {c.name}
                    </td>
                    <td className="py-2 text-stone-500 text-right tabular-nums">{c.visits}</td>
                    <td className="py-2 text-stone-700 font-medium text-right tabular-nums">{formatCurrency(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Product Sales ────────────────────────────────────────────────────── */}
      <SectionTitle>Product Sales</SectionTitle>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard
          label="Transactions"
          value={loading ? '—' : productSales.total_transactions.toLocaleString()}
        />
        <KpiCard
          label="Product Revenue"
          value={loading ? '—' : formatCurrency(productSales.total_revenue)}
          sub="excl. fully refunded"
        />
        <KpiCard
          label="Avg Sale Value"
          value={loading ? '—' : formatCurrency(productSales.avg_sale_value)}
          sub="per transaction"
        />
      </div>

      <Card className="mb-6">
        <CardTitle>Product Sales by Month</CardTitle>
        {productMonthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={productMonthData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f5f4" />
              <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <YAxis yAxisId="rev" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v)} />
              <YAxis yAxisId="txn" orientation="right" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => name === 'revenue' ? [formatCurrency(v), 'Revenue'] : [v, 'Transactions']}
              />
              <Bar yAxisId="rev" dataKey="revenue" fill={STONE_3} radius={[4, 4, 0, 0]} name="revenue" />
              <Line yAxisId="txn" type="monotone" dataKey="transactions" stroke={STONE} strokeWidth={2} dot={{ r: 3, fill: STONE, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} name="transactions" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : <Empty loading={loading} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardTitle>Top Products by Revenue</CardTitle>
          {productSales.top_by_revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={productSales.top_by_revenue} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={140} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {productSales.top_by_revenue.map((_, i) => <Cell key={i} fill={i === 0 ? STONE : STONE_3} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Top Products by Units Sold</CardTitle>
          {productSales.top_by_units.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={productSales.top_by_units} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={140} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Units sold']} />
                <Bar dataKey="units" radius={[0, 4, 4, 0]}>
                  {productSales.top_by_units.map((_, i) => <Cell key={i} fill={i === 0 ? STONE : STONE_3} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Expenses ─────────────────────────────────────────────────────────── */}
      <SectionTitle>Expenses</SectionTitle>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard
          label="Total Expenses"
          value={loading ? '—' : formatCurrency(expensesData.total)}
        />
        <KpiCard
          label="Avg Monthly"
          value={loading ? '—' : formatCurrency(expensesData.avg_monthly)}
          sub={`over ${expensesData.by_month.length} months`}
        />
        <KpiCard
          label="Largest Category"
          value={loading ? '—' : (expensesData.top_category ?? '—')}
          sub={
            expensesData.by_category.length > 0
              ? formatCurrency(expensesData.by_category[0]?.amount)
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardTitle>Monthly Expenses</CardTitle>
          {expenseMonthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={expenseMonthData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [formatCurrency(v), 'Expenses']} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill={RED} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Expenses by Category</CardTitle>
          {expensesData.by_category.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={expensesData.by_category} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={45} outerRadius={72} strokeWidth={0}>
                    {expensesData.by_category.map((_, i) => (
                      <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [formatCurrency(v), 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {expensesData.by_category.map((entry, i) => (
                  <div key={entry.category} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                      <span className="text-stone-600 truncate max-w-[110px]">{entry.category}</span>
                    </span>
                    <span className="text-stone-400">{formatCurrency(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Inventory ────────────────────────────────────────────────────────── */}
      <SectionTitle>Inventory</SectionTitle>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Active Products" value={loading ? '—' : inventoryData.total_active.toLocaleString()} />
        <KpiCard
          label="Out of Stock"
          value={loading ? '—' : inventoryData.out_of_stock.toLocaleString()}
          sub={inventoryData.out_of_stock > 0 ? 'needs restocking' : 'all clear'}
        />
        <KpiCard
          label="Low Stock"
          value={loading ? '—' : inventoryData.low_stock.toLocaleString()}
          sub="3 units or fewer"
        />
        <KpiCard
          label="On Order"
          value={loading ? '—' : inventoryData.on_order.toLocaleString()}
          sub="awaiting delivery"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardTitle>Stock Levels — At-Risk Products</CardTitle>
          {inventoryData.stock_levels.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={inventoryData.stock_levels} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={140} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [v, name === 'stock_qty' ? 'In stock' : 'On order']}
                />
                <Bar dataKey="stock_qty" name="stock_qty" radius={[0, 4, 4, 0]} stackId="a">
                  {inventoryData.stock_levels.map(item => (
                    <Cell
                      key={item.name}
                      fill={item.stock_qty <= 0 ? RED : item.stock_qty <= 3 ? AMBER : EMERALD}
                    />
                  ))}
                </Bar>
                <Bar dataKey="stock_on_order" name="stock_on_order" radius={[0, 4, 4, 0]} fill={BLUE} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Stock Alerts</CardTitle>
          {!loading && inventoryData.low_stock_items.length > 0 ? (
            <div className="space-y-1">
              {inventoryData.low_stock_items.map(item => (
                <div key={item.name} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                  <div className="min-w-0 mr-2">
                    <p className="text-sm text-stone-700 truncate">{item.name}</p>
                    <p className="text-xs text-stone-400">{item.brand}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.stock_qty <= 0 ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
                      {item.stock_qty <= 0 ? 'Out' : `${item.stock_qty} left`}
                    </span>
                    {item.stock_on_order > 0 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">
                        {item.stock_on_order} ordered
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-stone-300 text-sm">{loading ? 'Loading…' : 'All products well stocked'}</p>
          )}
        </Card>
      </div>
    </div>
  )
}
