import { useState, useEffect, useCallback } from 'react'
import api from '../api'

/**
 * Manages the appointment list and exposes CRUD + status operations.
 *
 * Appointments come back from the server enriched with patient_name,
 * service_name, and service_price — no client-side joins needed.
 * Mutation functions throw on error so calling forms can surface messages.
 *
 * @returns {{ appointments, loading, create, update, updateStatus, remove }}
 */
export function useAppointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await api.get('/appointments/')
    setAppointments(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /** Create a new appointment. Throws on API error. */
  const create = async (payload) => {
    await api.post('/appointments/', payload)
    await load()
  }

  /** Update all fields of an existing appointment. Throws on API error. */
  const update = async (id, payload) => {
    await api.put(`/appointments/${id}`, payload)
    await load()
  }

  /**
   * Inline status change — called directly from the table row dropdown
   * without opening the full edit panel.
   */
  const updateStatus = async (id, status) => {
    await api.patch(`/appointments/${id}/status?status=${encodeURIComponent(status)}`)
    await load()
  }

  /** Permanently delete an appointment by ID. Throws on API error. */
  const remove = async (id) => {
    await api.delete(`/appointments/${id}`)
    await load()
  }

  return { appointments, loading, create, update, updateStatus, remove }
}
