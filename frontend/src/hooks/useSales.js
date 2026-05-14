import { useState, useEffect, useCallback } from 'react'
import api from '../api'

export function useSales({ status = '', start = '', end = '' } = {}) {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (status) params.status = status
    if (start)  params.start = start
    if (end)    params.end = end
    api.get('/sales/', { params })
      .then(r => setSales(r.data))
      .catch(err => setError(err.response?.data?.detail ?? 'Failed to load sales.'))
      .finally(() => setLoading(false))
  }, [status, start, end])

  useEffect(() => { load() }, [load])

  async function createSale(data) {
    const r = await api.post('/sales/', data)
    setSales(prev => [r.data, ...prev])
    return r.data
  }

  async function createReturn(saleId, data) {
    const r = await api.post(`/sales/${saleId}/return`, data)
    setSales(prev => prev.map(s => s.id === saleId ? r.data : s))
    return r.data
  }

  return { sales, loading, error, createSale, createReturn, reload: load }
}
