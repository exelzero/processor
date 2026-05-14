import { useState, useEffect } from 'react'
import api from '../api'

export function useAnalytics() {
  const [revenueTrend, setRevenueTrend]       = useState({ by_month: [], avg_monthly_revenue: 0 })
  const [categoryMix, setCategoryMix]         = useState([])
  const [statusTrend, setStatusTrend]         = useState({ by_month: [], cancellation_rate: 0, no_show_rate: 0 })
  const [schedulePatterns, setSchedulePatterns] = useState({ by_weekday: [], by_hour: [] })
  const [servicePerf, setServicePerf]         = useState([])
  const [clientInsights, setClientInsights]   = useState({ growth: [], skin_types: [], retention: {}, top_clients: [] })
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/analytics/revenue-trend'),
      api.get('/analytics/category-mix'),
      api.get('/analytics/status-trend'),
      api.get('/analytics/schedule-patterns'),
      api.get('/analytics/service-performance'),
      api.get('/analytics/client-insights'),
    ])
      .then(([rt, cm, st, sp, svc, ci]) => {
        setRevenueTrend(rt.data)
        setCategoryMix(cm.data)
        setStatusTrend(st.data)
        setSchedulePatterns(sp.data)
        setServicePerf(svc.data)
        setClientInsights(ci.data)
      })
      .catch(err => setError(err.response?.data?.detail ?? 'Failed to load analytics.'))
      .finally(() => setLoading(false))
  }, [])

  return { revenueTrend, categoryMix, statusTrend, schedulePatterns, servicePerf, clientInsights, loading, error }
}
