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
    setLoading(true)
    setError(null)
    const params = { period }
    Promise.all([
      api.get('/analytics/revenue-trend',      { params }),
      api.get('/analytics/category-mix',       { params }),
      api.get('/analytics/status-trend',       { params }),
      api.get('/analytics/schedule-patterns',  { params }),
      api.get('/analytics/service-performance',{ params }),
      api.get('/analytics/client-insights',    { params }),
      api.get('/analytics/product-sales',      { params }),
      api.get('/analytics/expenses',           { params }),
      api.get('/analytics/inventory'),
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
      .catch(err => setError(err.response?.data?.detail ?? 'Failed to load analytics.'))
      .finally(() => setLoading(false))
  }, [period])

  return { revenueTrend, categoryMix, statusTrend, schedulePatterns, servicePerf, clientInsights, productSales, expensesData, inventoryData, loading, error }
}
