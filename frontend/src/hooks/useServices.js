import { useState, useEffect, useCallback } from 'react'
import api from '../api'

/**
 * Manages the service catalogue and exposes CRUD operations.
 *
 * Services are sorted server-side by category then name, so the list
 * is ready for display without any client-side sorting.
 * Mutation functions throw on error so calling forms can surface messages.
 *
 * @returns {{ services, loading, create, update, remove }}
 */
export function useServices() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await api.get('/services/')
    setServices(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /** Create a new service. Throws on API error. */
  const create = async (payload) => {
    await api.post('/services/', payload)
    await load()
  }

  /** Update an existing service by ID. Throws on API error. */
  const update = async (id, payload) => {
    await api.put(`/services/${id}`, payload)
    await load()
  }

  /** Permanently delete a service by ID. Throws on API error. */
  const remove = async (id) => {
    await api.delete(`/services/${id}`)
    await load()
  }

  return { services, loading, create, update, remove }
}
