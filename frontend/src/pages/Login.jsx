import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)
      const { data } = await api.post('/auth/login', form)
      localStorage.setItem('token', data.access_token)
      navigate('/dashboard')
    } catch (err) {
      // 401 = wrong credentials; anything else (500, network) = server problem
      setError(
        err.response?.status === 401
          ? 'Invalid username or password.'
          : 'Unable to sign in. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-light tracking-widest text-stone-800 uppercase">Processor</h1>
          <p className="text-stone-400 text-sm mt-1 tracking-wide">OK Beauty Space</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-xl p-8 shadow-sm space-y-5">
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-4 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              placeholder="admin"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-4 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
