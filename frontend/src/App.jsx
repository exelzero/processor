/**
 * Application root — defines the route tree and auth guard.
 *
 * PrivateRoute checks for a JWT in localStorage. If the token is missing
 * the user is redirected to /login. Token validity (expiry) is checked
 * server-side on every API call — a 401 response triggers a redirect via
 * the Axios interceptor in api.js, not here.
 *
 * To add a new page: create the component in pages/, add a <Route> here,
 * and add a nav entry in components/Layout.jsx.
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import Appointments from './pages/Appointments'
import Services from './pages/Services'
import Analytics from './pages/Analytics'
import Sales from './pages/Sales'
import Expenses from './pages/Expenses'
import Runway from './pages/Runway'
import Book from './pages/Book'

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/book" element={<Book />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="services" element={<Services />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="sales" element={<Sales />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="runway" element={<Runway />} />
      </Route>
    </Routes>
  )
}
