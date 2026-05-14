import { useEffect, useState } from 'react'
import { Users, CalendarCheck, DollarSign, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import api from '../api'

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">{label}</span>
        <Icon size={16} className="text-stone-300" />
      </div>
      <p className="text-3xl font-light text-stone-800">{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [revenue, setRevenue] = useState([])
  const [upcoming, setUpcoming] = useState([])

  useEffect(() => {
    api.get('/metrics/summary').then(r => setSummary(r.data))
    api.get('/metrics/revenue-by-service').then(r => setRevenue(r.data.slice(0, 6)))
    api.get('/metrics/upcoming').then(r => setUpcoming(r.data))
  }, [])

  return (
    <div className="p-8">
      <h2 className="text-xl font-light text-stone-800 mb-6 tracking-wide">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Patients" value={summary?.total_patients ?? '—'} />
        <StatCard icon={CalendarCheck} label="Appointments" value={summary?.total_appointments ?? '—'} sub={`${summary?.completed_appointments ?? 0} completed`} />
        <StatCard icon={DollarSign} label="Revenue" value={summary ? `$${summary.total_revenue.toLocaleString()}` : '—'} sub="from completed" />
        <StatCard icon={TrendingUp} label="Completion Rate" value={summary ? `${Math.round((summary.completed_appointments / (summary.total_appointments || 1)) * 100)}%` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by service */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">Revenue by Service</h3>
          {revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenue} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="service" tick={{ fontSize: 11, fill: '#a8a29e' }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={v => [`$${v}`, 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {revenue.map((_, i) => <Cell key={i} fill={i === 0 ? '#292524' : '#d6d3d1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-stone-300 text-sm">No data yet</p>}
        </div>

        {/* Upcoming appointments */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">Upcoming Appointments</h3>
          {upcoming.length === 0 ? (
            <p className="text-stone-300 text-sm">No upcoming appointments</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                  <div>
                    <p className="text-sm text-stone-700 font-medium">{a.patient}</p>
                    <p className="text-xs text-stone-400">{a.service}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-stone-500">{new Date(a.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <p className="text-xs text-stone-400">{new Date(a.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
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
