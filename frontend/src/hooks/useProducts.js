import { useState, useEffect, useCallback } from 'react'
import api from '../api'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/products/')
      .then(r => setProducts(r.data))
      .catch(err => setError(err.response?.data?.detail ?? 'Failed to load products.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function create(data) {
    const r = await api.post('/products/', data)
    setProducts(prev => [...prev, r.data])
    return r.data
  }

  async function update(id, data) {
    const r = await api.put(`/products/${id}`, data)
    setProducts(prev => prev.map(p => p.id === id ? r.data : p))
    return r.data
  }

  async function remove(id) {
    await api.delete(`/products/${id}`)
    setProducts(prev => prev.map(p => p.id === id ? { ...p, active: false } : p))
  }

  async function placeOrder(id, quantity, notes) {
    const r = await api.post(`/products/${id}/order`, { quantity, notes })
    setProducts(prev => prev.map(p => p.id === id ? r.data : p))
    return r.data
  }

  async function receiveOrder(id, quantity, notes) {
    const r = await api.post(`/products/${id}/receive`, { quantity, notes })
    setProducts(prev => prev.map(p => p.id === id ? r.data : p))
    return r.data
  }

  async function adjust(id, delta, notes) {
    const r = await api.post(`/products/${id}/adjust`, { delta, notes })
    setProducts(prev => prev.map(p => p.id === id ? r.data : p))
    return r.data
  }

  return { products, loading, error, create, update, remove, placeOrder, receiveOrder, adjust, reload: load }
}
