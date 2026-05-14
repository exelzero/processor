import { useState, useEffect } from 'react'
import api from '../api'

export function useMetrics() {
  const [summary, setSummary] = useState(null)
  const [onOrder, setOnOrder] = useState([])
  const [revenueByMonth, setRevenueByMonth] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/metrics/summary'),
      api.get('/metrics/on-order'),
      api.get('/metrics/revenue-by-month'),
      api.get('/metrics/upcoming'),
    ])
      .then(([s, o, m, u]) => {
        setSummary(s.data)
        setOnOrder(o.data)
        setRevenueByMonth(m.data)
        setUpcoming(u.data)
      })
      .catch(err => {
        setError(err.response?.data?.detail ?? 'Failed to load dashboard data.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return { summary, onOrder, revenueByMonth, upcoming, loading, error }
}
