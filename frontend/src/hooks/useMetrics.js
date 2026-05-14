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
  const [revenueByMonth, setRevenueByMonth] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [salesSummary, setSalesSummary] = useState(null)
  const [inventorySummary, setInventorySummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/metrics/summary'),
      api.get('/metrics/revenue-by-service'),
      api.get('/metrics/revenue-by-month'),
      api.get('/metrics/upcoming'),
      api.get('/metrics/sales-summary'),
      api.get('/metrics/inventory-summary'),
    ])
      .then(([s, r, m, u, ss, inv]) => {
        setSummary(s.data)
        setRevenueByService(r.data.slice(0, 6))
        setRevenueByMonth(m.data)
        setUpcoming(u.data)
        setSalesSummary(ss.data)
        setInventorySummary(inv.data)
      })
      .catch(err => {
        setError(err.response?.data?.detail ?? 'Failed to load dashboard data.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return { summary, revenueByService, revenueByMonth, upcoming, salesSummary, inventorySummary, loading, error }
}
