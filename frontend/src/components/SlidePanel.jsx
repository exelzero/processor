import { X } from 'lucide-react'

/**
 * Slide-in drawer panel used by all create/edit forms (Patients, Services, Appointments).
 *
 * Clicking the backdrop (outside the white panel) also closes the drawer,
 * so users aren't forced to find the X button.
 *
 * @param {boolean}  open     - Whether the panel is visible
 * @param {Function} onClose  - Called when the user dismisses the panel
 * @param {string}   title    - Heading shown at the top of the panel
 * @param {ReactNode} children - Form content rendered inside the panel
 */
export default function SlidePanel({ open, onClose, title, children }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/20 z-40 flex justify-end"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full max-w-md h-full overflow-auto shadow-xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-medium text-stone-800">{title}</h3>
          <button onClick={onClose} aria-label="Close panel">
            <X size={18} className="text-stone-400 hover:text-stone-700 transition-colors" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
