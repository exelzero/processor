import { useState, useEffect } from 'react'
import api from '../api'

/**
 * Fetches all dashboard metrics in parallel on mount.
 *
 * Three separate endpoints are called concurrently (Promise.all) so the
 * dashboard doesn't waterfall — all panels load at the same time.
 *
 * If any request fails, `error` is set and the dashboard shows a message
 * instead of leaving all panels blank with no explanation.
 *
 * @returns {{ summary, revenueByService, upcoming, loading, error }}
 */
export function useMetrics() {
  const [summary, setSummary] = useState(null)
  const [revenueByService, setRevenueByService] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/metrics/summary'),
      api.get('/metrics/revenue-by-service'),
      api.get('/metrics/upcoming'),
    ])
      .then(([s, r, u]) => {
        setSummary(s.data)
        setRevenueByService(r.data.slice(0, 6)) // cap chart at 6 bars for readability
        setUpcoming(u.data)
      })
      .catch(err => {
        setError(err.response?.data?.detail ?? 'Failed to load dashboard data.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return { summary, revenueByService, upcoming, loading, error }
}
