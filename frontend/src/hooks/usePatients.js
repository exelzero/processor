import { useState, useEffect, useCallback } from 'react'
import api from '../api'

/**
 * Manages the full patient list and exposes CRUD operations.
 *
 * After every successful mutation the list is automatically re-fetched so
 * the UI always reflects server state without manual cache management.
 * Mutation functions throw on error so the calling form can catch and
 * display the message to the user.
 *
 * @returns {{ patients, loading, create, update, remove }}
 */
export function usePatients() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await api.get('/patients/')
    setPatients(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /** Create a new patient record. Throws on API error. */
  const create = async (payload) => {
    await api.post('/patients/', payload)
    await load()
  }

  /** Update an existing patient by ID. Throws on API error. */
  const update = async (id, payload) => {
    await api.put(`/patients/${id}`, payload)
    await load()
  }

  /** Permanently delete a patient by ID. Throws on API error. */
  const remove = async (id) => {
    await api.delete(`/patients/${id}`)
    await load()
  }

  return { patients, loading, create, update, remove }
}
