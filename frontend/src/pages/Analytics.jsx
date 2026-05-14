import { useId } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart, Line,
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

const SKIN_COLORS = ['#292524', '#57534e', '#78716c', '#a8a29e', '#d6d3d1']

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
const AXIS_STYLE = { fontSize: 11, fill: '#a8a29e' }
const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }

// ── Small shared components ───────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4 mt-8 first:mt-0">
      {children}
    </h2>
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

// ── Custom Tooltip helpers ────────────────────────────────────────────────────
function currencyTooltip(v) {
  return [formatCurrency(v), 'Revenue']
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { revenueTrend, categoryMix, statusTrend, schedulePatterns, servicePerf, clientInsights, loading, error } = useAnalytics()
  const gradientId = useId()

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-light text-stone-800 mb-6 tracking-wide">Analytics</h1>
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

  const monthChartData = revenueTrend.by_month.map(r => ({
    ...r,
    label: shortMonth(r.month),
  }))

  const statusChartData = statusTrend.by_month.map(r => ({
    ...r,
    label: shortMonth(r.month),
  }))

  const retentionData = clientInsights.retention.one_time != null
    ? [
        { name: 'Returning', value: clientInsights.retention.returning },
        { name: 'First-time', value: clientInsights.retention.one_time },
      ]
    : []

  const topServicesByCount = [...servicePerf].sort((a, b) => b.count - a.count).slice(0, 8)

  return (
    <div className="p-8">
      <h1 className="text-xl font-light text-stone-800 mb-6 tracking-wide">Analytics</h1>

      {/* ── KPI Strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Total Revenue"
          value={loading ? '—' : formatCurrency(totalRevenue)}
          sub="completed appointments"
        />
        <KpiCard
          label="Avg Monthly Revenue"
          value={loading ? '—' : formatCurrency(revenueTrend.avg_monthly_revenue)}
          sub={`over ${revenueTrend.by_month.length} months`}
        />
        <KpiCard
          label="Completion Rate"
          value={loading ? '—' : `${completionRate}%`}
          sub={`${cancellation_rate}% cancelled · ${no_show_rate}% no-show`}
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
        {/* Revenue trend — 2/3 width */}
        <Card className="lg:col-span-2">
          <CardTitle>Monthly Revenue & Volume</CardTitle>
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

        {/* Category mix — 1/3 width */}
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
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={currencyTooltip} />
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

      {/* Status breakdown by month — full width stacked bar */}
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
              <Bar dataKey="completed" stackId="a" fill={EMERALD} radius={[0, 0, 0, 0]} name="Completed" />
              <Bar dataKey="cancelled" stackId="a" fill={STONE_3} name="Cancelled" />
              <Bar dataKey="no-show"   stackId="a" fill={RED}     name="No-show" />
              <Bar dataKey="scheduled" stackId="a" fill={BLUE}    radius={[4, 4, 0, 0]} name="Scheduled" />
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty loading={loading} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Day of week */}
        <Card>
          <CardTitle>Busiest Day of Week</CardTitle>
          {schedulePatterns.by_weekday.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={schedulePatterns.by_weekday} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="day" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Appointments']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Appointments">
                  {schedulePatterns.by_weekday.map((entry, i, arr) => {
                    const max = Math.max(...arr.map(d => d.count))
                    return <Cell key={entry.day} fill={entry.count === max ? STONE : STONE_3} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        {/* Hour of day */}
        <Card>
          <CardTitle>Busiest Hour of Day</CardTitle>
          {schedulePatterns.by_hour.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={schedulePatterns.by_hour} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="hour" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Appointments']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Appointments">
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
        {/* Top services by revenue */}
        <Card>
          <CardTitle>Top Services by Revenue</CardTitle>
          {servicePerf.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={servicePerf} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={currencyTooltip} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {servicePerf.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? STONE : STONE_3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        {/* Top services by booking count */}
        <Card>
          <CardTitle>Top Services by Bookings</CardTitle>
          {topServicesByCount.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topServicesByCount} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v, 'Bookings']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {topServicesByCount.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? STONE : STONE_3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Clients ─────────────────────────────────────────────────────────── */}
      <SectionTitle>Clients</SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* New client acquisition — 2/3 width */}
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

        {/* Retention donut — 1/3 width */}
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
        {/* Skin type distribution */}
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

        {/* Top clients table — 2/3 width */}
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
    </div>
  )
}
