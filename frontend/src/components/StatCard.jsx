/**
 * Metric summary card shown in the Dashboard stats row.
 *
 * Designed to be used in a 4-column grid. The icon sits top-right as a
 * subtle visual anchor — it uses a light stone color so it doesn't
 * compete with the number itself.
 *
 * @param {LucideIcon} icon  - Lucide icon component (not an element — pass the component itself)
 * @param {string}     label - Short label above the number, e.g. "Patients"
 * @param {string}     value - The primary metric value, e.g. "25" or "$4,200"
 * @param {string}     [sub] - Optional secondary line below the number
 */
export default function StatCard({ icon: Icon, label, value, sub }) {
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
