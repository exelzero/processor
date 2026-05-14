/**
 * Shared formatting utilities used across all pages.
 *
 * Keep all display-layer transformations here so that changing a format
 * (e.g. switching date locale, adding currency symbol) is a one-line edit
 * rather than a grep-and-replace across every component.
 */

/**
 * Format an ISO datetime string to a short human-readable date.
 * Example: "2026-05-14T10:00:00Z" → "May 14, 2026"
 */
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format an ISO datetime string to a 12-hour clock time.
 * Example: "2026-05-14T14:30:00Z" → "2:30 PM"
 */
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Format a number as a USD dollar amount.
 * Handles null/undefined gracefully — treats them as zero.
 * Example: 185 → "$185", 185.5 → "$185.50"
 */
export function formatCurrency(amount) {
  return `$${(amount ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Convert any ISO datetime string to the format required by
 * <input type="datetime-local"> — "YYYY-MM-DDTHH:MM" in local time.
 *
 * Avoids the DST-unsafe UTC-offset arithmetic approach of using
 * getTimezoneOffset(), which breaks on clocks-change boundaries.
 */
export function toDatetimeLocal(iso) {
  const dt = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return [
    dt.getFullYear(),
    '-',
    pad(dt.getMonth() + 1),
    '-',
    pad(dt.getDate()),
    'T',
    pad(dt.getHours()),
    ':',
    pad(dt.getMinutes()),
  ].join('')
}
