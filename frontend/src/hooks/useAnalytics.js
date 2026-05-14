import { useState, useEffect } from 'react'
import api from '../api'

export function useAnalytics(period = 'ytd') {
  const [revenueTrend, setRevenueTrend]         = useState({ by_month: [], avg_monthly_revenue: 0 })
  const [categoryMix, setCategoryMix]           = useState([])
  const [statusTrend, setStatusTrend]           = useState({ by_month: [], cancellation_rate: 0, no_show_rate: 0 })
  const [schedulePatterns, setSchedulePatterns] = useState({ by_weekday: [], by_hour: [] })
  const [servicePerf, setServicePerf]           = useState([])
  const [clientInsights, setClientInsights]     = useState({ growth: [], skin_types: [], retention: {}, top_clients: [] })
  const [productSales, setProductSales]         = useState({ total_transactions: 0, total_revenue: 0, avg_sale_value: 0, by_month: [], top_by_revenue: [], top_by_units: [] })
  const [expensesData, setExpensesData]         = useState({ total: 0, avg_monthly: 0, top_category: null, by_month: [], by_category: [] })
  const [inventoryData, setInventoryData]       = useState({ total_active: 0, out_of_stock: 0, low_stock: 0, on_order: 0, stock_levels: [], low_stock_items: [] })
  const [loading, setLoading]                   = useState(true)
  const [error, setError]                       = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    setLoading(true)
    setError(null)
    const params = { period }
    Promise.all([
      api.get('/analytics/revenue-trend',      { params, signal }),
      api.get('/analytics/category-mix',       { params, signal }),
      api.get('/analytics/status-trend',       { params, signal }),
      api.get('/analytics/schedule-patterns',  { params, signal }),
      api.get('/analytics/service-performance',{ params, signal }),
      api.get('/analytics/client-insights',    { params, signal }),
      api.get('/analytics/product-sales',      { params, signal }),
      api.get('/analytics/expenses',           { params, signal }),
      api.get('/analytics/inventory',          { signal }),
    ])
      .then(([rt, cm, st, sp, svc, ci, ps, ex, inv]) => {
        setRevenueTrend(rt.data)
        setCategoryMix(cm.data)
        setStatusTrend(st.data)
        setSchedulePatterns(sp.data)
        setServicePerf(svc.data)
        setClientInsights(ci.data)
        setProductSales(ps.data)
        setExpensesData(ex.data)
        setInventoryData(inv.data)
      })
      .catch(err => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError(err.response?.data?.detail ?? 'Failed to load analytics.')
        }
      })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period])

  return { revenueTrend, categoryMix, statusTrend, schedulePatterns, servicePerf, clientInsights, productSales, expensesData, inventoryData, loading, error }
}
