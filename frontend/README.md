# Frontend — Processor

React + Vite single-page app for the Processor business portal.

---

## Start

```bash
npm install
npm run dev
# → http://localhost:5173
```

Requires the backend running at `http://localhost:8000`. See the [root README](../README.md) for backend setup.

---

## Structure

```
src/
├── pages/           # One file per full-page view
├── components/      # Reusable UI (SlidePanel, DataTable, StatCard, …)
├── hooks/           # Data-fetching hooks — each wraps one API domain
├── utils/
│   └── format.js    # formatCurrency, formatDate, formatTime
├── api.js           # Axios instance — attaches JWT from localStorage
├── App.jsx          # Route definitions
└── main.jsx         # Entry point
```

---

## Pages & Their Hooks

| Page              | Hook              | API prefix        |
|-------------------|-------------------|-------------------|
| `Dashboard.jsx`   | `useMetrics`      | `/api/metrics`    |
| `Analytics.jsx`   | `useAnalytics`    | `/api/analytics`  |
| `Patients.jsx`    | `usePatients`     | `/api/patients`   |
| `Appointments.jsx`| `useAppointments` | `/api/appointments` |
| `Services.jsx`    | `useServices`     | `/api/services`   |
| `Sales.jsx`       | `useSales`, `useProducts` | `/api/sales`, `/api/products` |
| `Expenses.jsx`    | `useExpenses`     | `/api/expenses`   |

---

## Key Conventions

- **Hooks own all API calls.** Pages never call `api.get/post` directly — they use a hook and get back state + handlers.
- **SlidePanel** is the standard pattern for create/edit forms — open it by setting a state object, close by setting it to `null`. Always guard JSX props against `null` before the panel opens.
- **formatCurrency / formatDate / formatTime** — import from `utils/format.js`, never inline.
- **Auth** — the JWT is stored in `localStorage` under `token`. `api.js` attaches it as `Authorization: Bearer <token>` on every request. On 401, the user is redirected to `/login`.

---

## Scripts

```bash
npm run dev      # Dev server with HMR
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
npm run lint     # ESLint
```
