import { useState, useEffect, useCallback } from 'react'
import api from '../api'

/**
 * Manages documents for a single patient.
 * Only fetches when patientId is set — safe to mount before a patient is selected.
 */
export function useDocuments(patientId) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!patientId) return
    setLoading(true)
    const { data } = await api.get(`/patients/${patientId}/documents/`)
    setDocuments(data)
    setLoading(false)
  }, [patientId])

  useEffect(() => { load() }, [load])

  const upload = async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    await api.post(`/patients/${patientId}/documents/`, formData)
    await load()
  }

  const download = async (doc) => {
    const { data } = await api.get(`/patients/${patientId}/documents/${doc.id}/download`)
    window.open(data.url, '_blank')
  }

  const remove = async (docId) => {
    await api.delete(`/patients/${patientId}/documents/${docId}`)
    await load()
  }

  return { documents, loading, upload, download, remove }
}
