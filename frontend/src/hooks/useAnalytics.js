import { useState, useEffect } from 'react'
import api from '../api'

export function useAnalytics({ startDate, endDate }) {
  const [revenueTrend, setRevenueTrend]         = useState({ by_month: [], avg_monthly_revenue: 0 })
  const [categoryMix, setCategoryMix]           = useState([])
  const [statusTrend, setStatusTrend]           = useState({ by_month: [], cancellation_rate: 0, no_show_rate: 0 })
  const [schedulePatterns, setSchedulePatterns] = useState({ by_weekday: [], by_hour: [] })
  const [servicePerf, setServicePerf]           = useState([])
  const [clientInsights, setClientInsights]     = useState({ growth: [], skin_types: [], retention: {}, top_clients: [] })
  const [loading, setLoading]                   = useState(true)
  const [error, setError]                       = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const params = {}
    if (startDate) params.start = startDate
    if (endDate)   params.end   = endDate

    Promise.all([
      api.get('/analytics/revenue-trend',     { params }),
      api.get('/analytics/category-mix',      { params }),
      api.get('/analytics/status-trend',      { params }),
      api.get('/analytics/schedule-patterns', { params }),
      api.get('/analytics/service-performance', { params }),
      api.get('/analytics/client-insights',   { params }),
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
  }, [startDate, endDate])

  return { revenueTrend, categoryMix, statusTrend, schedulePatterns, servicePerf, clientInsights, loading, error }
}
