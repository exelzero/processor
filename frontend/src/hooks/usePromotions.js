import { useState, useEffect, useCallback } from 'react'
import api from '../api'

export function usePromotions() {
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/promotions/')
      .then(r => setPromotions(r.data))
      .catch(err => setError(err.response?.data?.detail ?? 'Failed to load promotions.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function create(data) {
    const r = await api.post('/promotions/', data)
    setPromotions(prev => [r.data, ...prev])
    return r.data
  }

  async function update(id, data) {
    const r = await api.put(`/promotions/${id}`, data)
    setPromotions(prev => prev.map(p => p.id === id ? r.data : p))
    return r.data
  }

  async function deactivate(id) {
    await api.delete(`/promotions/${id}`)
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, active: false } : p))
  }

  return { promotions, loading, error, create, update, deactivate, reload: load }
}
