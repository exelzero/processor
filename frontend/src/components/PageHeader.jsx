import { Plus } from 'lucide-react'

/**
 * Standard page header with a title on the left and an optional primary
 * action button (e.g. "New Patient") on the right.
 *
 * Used at the top of every list page to keep spacing and typography consistent.
 *
 * @param {string}   title      - Page heading text
 * @param {string}   [action]   - Label for the primary action button; omit to hide the button
 * @param {Function} [onAction] - Called when the action button is clicked
 */
export default function PageHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-light text-stone-800 tracking-wide">{title}</h2>
      {action && (
        <button
          onClick={onAction}
          className="flex items-center gap-2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={14} />
          {action}
        </button>
      )}
    </div>
  )
}
