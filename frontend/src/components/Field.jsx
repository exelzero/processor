/**
 * Labeled text input used consistently across all create/edit forms.
 *
 * Centralising the input style here means a single edit changes every
 * form field in the app simultaneously. For select dropdowns, textareas,
 * or checkboxes, use inline JSX directly in the form — those don't repeat
 * enough to warrant their own components yet.
 *
 * @param {string}   label        - Field label shown above the input
 * @param {string}   [type=text]  - HTML input type (text, email, date, number…)
 * @param {string}   value        - Controlled value
 * @param {Function} onChange     - Called with the new string value (not the event)
 * @param {boolean}  [required]   - Adds HTML required validation
 * @param {string}   [placeholder]
 */
export default function Field({ label, type = 'text', value, onChange, required, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
      />
    </div>
  )
}
