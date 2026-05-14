import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'
import { useRunway } from '../hooks/useRunway'
import { formatCurrency } from '../utils/format'

// ── Palette ───────────────────────────────────────────────────────────────────
const STONE   = '#292524'
const STONE_3 = '#d6d3d1'
const EMERALD = '#10b981'
const RED     = '#f87171'
const AMBER   = '#fbbf24'

// ── Shared chart config ───────────────────────────────────────────────────────
const AXIS_STYLE    = { fontSize: 11, fill: '#a8a29e' }
const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }

// ── Small shared components ───────────────────────────────────────────────────
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

function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-10 first:mt-0">
      <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest whitespace-nowrap">{children}</h2>
      <div className="flex-1 h-px bg-stone-100" />
    </div>
  )
}

function KpiCard({ label, value, sub, highlight }) {
  const valueColor =
    highlight === 'green' ? 'text-emerald-600' :
    highlight === 'red'   ? 'text-red-500'     :
    highlight === 'amber' ? 'text-amber-500'   :
                            'text-stone-800'
  return (
    <Card>
      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-light ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
    </Card>
  )
}

function Empty({ loading }) {
  return <p className="text-stone-300 text-sm">{loading ? 'Loading…' : 'No data yet'}</p>
}

// ── Custom tooltip for seasonal chart ────────────────────────────────────────
function SeasonalTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE} className="bg-white px-3 py-2">
      <p className="text-xs font-medium text-stone-700">{d.label}</p>
      <p className="text-xs text-stone-500">{d.note}</p>
      <p className="text-xs text-stone-700 mt-1">Factor: <span className="font-medium">{d.factor.toFixed(2)}×</span></p>
    </div>
  )
}

// ── Custom tooltip for forecast chart ────────────────────────────────────────
function ForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE} className="bg-white px-3 py-2 space-y-0.5">
      <p className="text-xs font-medium text-stone-700">{d.label} {d.month.split('-')[0]}</p>
      <p className="text-xs text-stone-400 italic mb-1">{d.seasonal_note}</p>
      <p className="text-xs text-stone-600">Revenue: <span className="font-medium">{formatCurrency(d.projected_revenue)}</span></p>
      <p className="text-xs text-stone-600">Expenses: <span className="font-medium">{formatCurrency(d.projected_expenses)}</span></p>
      <p className={`text-xs font-medium ${d.projected_net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        Net: {d.projected_net >= 0 ? '+' : ''}{formatCurrency(d.projected_net)}
      </p>
      <p className="text-xs text-stone-700 border-t border-stone-100 pt-1 mt-1">
        Cash: <span className="font-medium">{formatCurrency(d.cumulative_cash)}</span>
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Runway() {
  const { data, loading, error } = useRunway()

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-light text-stone-800 mb-4 tracking-wide">Runway</h1>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    )
  }

  const runwayLabel = loading ? '—'
    : data.is_profitable  ? 'Profitable ↑'
    : data.months_of_runway !== null ? `${data.months_of_runway} months`
    : '—'

  const runwayHighlight = loading ? undefined
    : data.is_profitable                        ? 'green'
    : data.months_of_runway !== null && data.months_of_runway <= 3  ? 'red'
    : data.months_of_runway !== null && data.months_of_runway <= 6  ? 'amber'
    : 'red'

  // Mark where cash goes below zero in the forecast
  const breakEvenMonth = data?.forecast?.find(f => f.cumulative_cash < 0)

  return (
    <div className="p-8">
      <h1 className="text-xl font-light text-stone-800 mb-6 tracking-wide">Runway</h1>

      {/* ── KPI Strip ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Current Cash"
          value={loading ? '—' : formatCurrency(data.current_cash)}
          sub="derived from all revenue − expenses"
          highlight={!loading && data.current_cash < 0 ? 'red' : undefined}
        />
        <KpiCard
          label="Monthly Burn Rate"
          value={loading ? '—' : formatCurrency(data.burn_rate)}
          sub="avg monthly expenses"
        />
        <KpiCard
          label="Avg Monthly Revenue"
          value={loading ? '—' : formatCurrency(data.monthly_avg_revenue)}
          sub={loading ? undefined : `avg net +${formatCurrency(data.monthly_avg_net)}/mo`}
        />
        <KpiCard
          label="Runway"
          value={runwayLabel}
          sub={data?.is_profitable ? 'cash-flow positive' : 'at current burn rate'}
          highlight={runwayHighlight}
        />
      </div>

      {/* ── Cash Projection ──────────────────────────────────────────────────── */}
      <SectionTitle>12-Month Cash Projection</SectionTitle>

      <Card className="mb-6">
        <CardTitle>Projected Cumulative Cash Balance</CardTitle>
        {!loading && data.forecast.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.forecast} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f5f4" />
              <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v)} />
              <Tooltip content={<ForecastTooltip />} />
              {/* Zero line — cash below here means the business is out of money */}
              <ReferenceLine y={0} stroke={RED} strokeDasharray="4 3" strokeWidth={1.5} />
              <Line
                type="monotone"
                dataKey="cumulative_cash"
                stroke={STONE}
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props
                  const color = payload.cumulative_cash < 0 ? RED : EMERALD
                  return <circle key={payload.month} cx={cx} cy={cy} r={4} fill={color} strokeWidth={0} />
                }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : <Empty loading={loading} />}
        {!loading && breakEvenMonth && (
          <p className="text-xs text-red-400 mt-3">
            ⚠ Cash goes negative in <span className="font-medium">{breakEvenMonth.label} {breakEvenMonth.month.split('-')[0]}</span> at current trajectory.
          </p>
        )}
        {!loading && !breakEvenMonth && data?.forecast?.length > 0 && (
          <p className="text-xs text-emerald-500 mt-3">
            Cash remains positive across the full 12-month forecast window.
          </p>
        )}
      </Card>

      {/* ── Monthly Net Forecast ─────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Projected Monthly Net — Next 12 Months</CardTitle>
        {!loading && data.forecast.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.forecast} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f5f4" />
              <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [formatCurrency(v), name === 'projected_net' ? 'Net' : name]}
              />
              <ReferenceLine y={0} stroke={STONE_3} strokeWidth={1} />
              <Bar dataKey="projected_net" radius={[4, 4, 0, 0]}>
                {data.forecast.map(f => (
                  <Cell key={f.month} fill={f.projected_net >= 0 ? EMERALD : RED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty loading={loading} />}
      </Card>

      {/* ── Seasonal Index ───────────────────────────────────────────────────── */}
      <SectionTitle>Seasonal Trends</SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardTitle>Seasonal Revenue Index by Month</CardTitle>
          {!loading && data.seasonal_factors.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.seasonal_factors} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis
                  tick={AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                  domain={[0.6, 1.4]}
                  tickFormatter={v => `${v.toFixed(1)}×`}
                />
                <Tooltip content={<SeasonalTooltip />} />
                {/* Baseline — factor of 1.0 = average month */}
                <ReferenceLine y={1} stroke={STONE_3} strokeDasharray="4 3" strokeWidth={1.5} />
                <Bar dataKey="factor" radius={[4, 4, 0, 0]}>
                  {data.seasonal_factors.map(f => (
                    <Cell
                      key={f.month}
                      fill={f.factor > 1.05 ? EMERALD : f.factor < 0.95 ? AMBER : STONE_3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty loading={loading} />}
        </Card>

        <Card>
          <CardTitle>Holiday & Event Calendar</CardTitle>
          {!loading ? (
            <div className="space-y-2">
              {data.seasonal_factors.map(f => (
                <div key={f.month} className="flex items-center justify-between text-xs py-1 border-b border-stone-50 last:border-0">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: f.factor > 1.05 ? EMERALD : f.factor < 0.95 ? AMBER : STONE_3 }}
                    />
                    <span className="font-medium text-stone-700 w-7">{f.label}</span>
                    <span className="text-stone-400">{f.note}</span>
                  </span>
                  <span className={`font-medium tabular-nums ${f.factor > 1.05 ? 'text-emerald-600' : f.factor < 0.95 ? 'text-amber-500' : 'text-stone-400'}`}>
                    {f.factor.toFixed(2)}×
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty loading={loading} />}
        </Card>
      </div>

      {/* ── Historical Monthly ───────────────────────────────────────────────── */}
      <SectionTitle>Historical Baseline</SectionTitle>

      <Card className="mb-6">
        <CardTitle>Actual Monthly Revenue vs Expenses</CardTitle>
        {!loading && data.historical_monthly.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.historical_monthly} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f5f5f4" />
              <XAxis dataKey="month" tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => v.slice(5)} />
              <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [formatCurrency(v), name === 'revenue' ? 'Revenue' : 'Expenses']}
              />
              <Bar dataKey="revenue"  fill={STONE}   radius={[4, 4, 0, 0]} name="revenue"  />
              <Bar dataKey="expenses" fill={STONE_3} radius={[4, 4, 0, 0]} name="expenses" />
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty loading={loading} />}
      </Card>
    </div>
  )
}
