/**
 * Colored pill label for appointment status values.
 *
 * Add new statuses to STATUS_STYLES as the business adds them —
 * unknown values fall back to a neutral grey so nothing breaks silently.
 */
const STATUS_STYLES = {
  scheduled:  'bg-blue-50 text-blue-600',
  completed:  'bg-emerald-50 text-emerald-600',
  cancelled:  'bg-stone-100 text-stone-400',
  'no-show':  'bg-red-50 text-red-400',
}

/**
 * @param {string}   status    - Appointment status string
 * @param {boolean}  asSelect  - When true, renders a <select> for inline editing
 * @param {Function} onChange  - Required when asSelect is true
 */
export default function StatusBadge({ status, asSelect = false, onChange }) {
  const style = STATUS_STYLES[status] ?? 'bg-stone-100 text-stone-500'

  if (asSelect) {
    return (
      <select
        value={status}
        onChange={e => onChange(e.target.value)}
        className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 capitalize cursor-pointer focus:outline-none ${style}`}
      >
        {Object.keys(STATUS_STYLES).map(s => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
    )
  }

  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${style}`}>
      {status}
    </span>
  )
}
