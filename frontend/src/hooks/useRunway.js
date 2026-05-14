import { useState, useEffect } from 'react'
import api from '../api'

export function useRunway() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    api.get('/runway', { signal: controller.signal })
      .then(res => setData(res.data))
      .catch(err => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError(err.response?.data?.detail ?? 'Failed to load runway data.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  return { data, loading, error }
}
