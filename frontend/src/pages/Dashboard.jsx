import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { Users, CalendarCheck, DollarSign, Receipt } from 'lucide-react'
import { useMetrics } from '../hooks/useMetrics'
import StatCard from '../components/StatCard'
import { formatDate, formatTime, formatCurrency } from '../utils/format'

const MONTH_LABELS = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

export default function Dashboard() {
  const { summary, revenueByService, revenueByMonth, upcoming, loading, error } = useMetrics()

  const monthChartData = revenueByMonth.map(r => ({
    ...r,
    label: r.month ? (MONTH_LABELS[r.month.split('-')[1]] ?? r.month) : 'Unknown',
  }))

  if (error) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-light text-stone-800 mb-6 tracking-wide">Dashboard</h2>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-light text-stone-800 mb-6 tracking-wide">Dashboard</h2>

      {/* KPI summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Patients" value={summary?.total_patients ?? '—'} />
        <StatCard
          icon={CalendarCheck}
          label="Appointments"
          value={summary?.total_appointments ?? '—'}
          sub={`${summary?.completed_appointments ?? 0} completed`}
        />
        <StatCard
          icon={DollarSign}
          label="Revenue"
          value={loading ? '—' : formatCurrency(summary?.total_revenue)}
          sub="services + product sales"
        />
        <StatCard
          icon={Receipt}
          label="Expenses"
          value={loading ? '—' : formatCurrency(summary?.total_expenses)}
          sub={
            !loading && summary
              ? summary.total_revenue >= summary.total_expenses
                ? `+${formatCurrency(summary.total_revenue - summary.total_expenses)} net`
                : `−${formatCurrency(summary.total_expenses - summary.total_revenue)} deficit`
              : undefined
          }
        />
      </div>

      {/* Revenue vs Expenses by month — two-line comparison chart */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 mb-6">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
          Revenue vs Expenses — Year to Date
        </h3>
        {monthChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthChartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f5f4" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => formatCurrency(v)}
              />
              <Tooltip
                formatter={(v, name) => [formatCurrency(v), name === 'revenue' ? 'Revenue' : 'Expenses']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={name => name === 'revenue' ? 'Revenue' : 'Expenses'}
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#292524"
                strokeWidth={2}
                dot={{ r: 3, fill: '#292524', strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-stone-300 text-sm">{loading ? 'Loading…' : 'No data yet'}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by service — bar chart capped at 6 services for readability */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
            Revenue by Service
          </h3>
          {revenueByService.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByService} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <XAxis
                  dataKey="service"
                  tick={{ fontSize: 11, fill: '#a8a29e' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#a8a29e' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => formatCurrency(v)}
                />
                <Tooltip
                  formatter={v => [formatCurrency(v), 'Revenue']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {revenueByService.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#292524' : '#d6d3d1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-stone-300 text-sm">{loading ? 'Loading…' : 'No completed appointments yet'}</p>
          )}
        </div>

        {/* Next 10 upcoming appointments — ordered by scheduled_at ascending */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
            Upcoming Appointments
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-stone-300 text-sm">{loading ? 'Loading…' : 'No upcoming appointments'}</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                  <div>
                    <p className="text-sm text-stone-700 font-medium">{a.patient}</p>
                    <p className="text-xs text-stone-400">{a.service}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-stone-500">{formatDate(a.scheduled_at)}</p>
                    <p className="text-xs text-stone-400">{formatTime(a.scheduled_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
