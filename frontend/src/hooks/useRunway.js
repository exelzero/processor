import { useState, useEffect } from 'react'
import api from '../api'

export function useRunway() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/runway')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.detail ?? 'Failed to load runway data.'))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
