import { Children } from 'react'

/**
 * Standard table shell used by Patients and Appointments pages.
 *
 * Handles the loading state internally so pages don't need to repeat
 * the same empty-row logic. The last column header is intentionally blank
 * — it holds row action buttons (Edit / Delete) which don't need a label.
 *
 * Uses React.Children.count() to detect empty rows reliably — this handles
 * arrays, single elements, fragments, and conditional renders correctly,
 * unlike a plain `!children` or `children.length === 0` check.
 *
 * @param {string[]}  columns  - Column header labels (left-aligned)
 * @param {boolean}   loading  - Shows a "Loading…" row while true
 * @param {string}    empty    - Message shown when there are no rows to display
 * @param {ReactNode} children - <tr> elements for each data row
 */
export default function DataTable({ columns, loading, empty = 'No records found', children }) {
  const colSpan = columns.length + 1
  const isEmpty = Children.count(children) === 0

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="overflow-auto flex-1">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b border-stone-100">
            {columns.map(col => (
              <th
                key={col}
                className="text-left px-5 py-3.5 text-xs font-medium text-stone-400 uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
            {/* Actions column — no header label */}
            <th className="px-5 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="px-5 py-8 text-center text-stone-300 text-sm">
                Loading…
              </td>
            </tr>
          ) : isEmpty ? (
            <tr>
              <td colSpan={colSpan} className="px-5 py-8 text-center text-stone-300 text-sm">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
