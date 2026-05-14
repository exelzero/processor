/**
 * Configured Axios instance for all API calls to the FastAPI backend.
 *
 * Two interceptors are registered globally so every request/response
 * goes through them automatically — no need to handle auth or 401s
 * in individual hooks or components.
 *
 * Request interceptor  → attaches the JWT from localStorage as a Bearer token.
 * Response interceptor → on a 401, clears the token and redirects to /login
 *                        so expired or invalid sessions don't get stuck in a
 *                        loop of silent failures.
 */
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
