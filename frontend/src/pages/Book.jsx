import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Clock, DollarSign, ChevronLeft, ChevronRight, Loader } from 'lucide-react'
import api from '../api'
import { formatCurrency } from '../utils/format'

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = ['Service', 'Date & Time', 'Your Details', 'Confirm']

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

const CATEGORY_ORDER = ['Facial', 'Treatment', 'Advanced', 'Consultation']

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateString(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatSlot(time) {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatBookingDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              i < current  ? 'bg-stone-800 text-white'
              : i === current ? 'bg-stone-800 text-white ring-4 ring-stone-200'
              : 'bg-stone-100 text-stone-400'
            }`}>
              {i < current ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className={`text-xs mt-1 whitespace-nowrap ${i === current ? 'text-stone-700 font-medium' : 'text-stone-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-12 h-px mb-5 mx-1 ${i < current ? 'bg-stone-800' : 'bg-stone-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function Btn({ onClick, disabled, children, variant = 'primary', type = 'button' }) {
  const base = 'flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-stone-800 text-white hover:bg-stone-700',
    ghost:   'text-stone-500 hover:text-stone-800',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  )
}

function Input({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-300"
      />
    </div>
  )
}

// ── Step 1: Service ────────────────────────────────────────────────────────────

function ServiceStep({ onSelect }) {
  const [services, setServices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    api.get('/public/services')
      .then(r => setServices(r.data))
      .catch(() => setError('Could not load services. Please refresh and try again.'))
      .finally(() => setLoading(false))
  }, [])

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = services.filter(s => s.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})
  const other = services.filter(s => !CATEGORY_ORDER.includes(s.category))
  if (other.length) grouped['Other'] = other

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader size={24} className="animate-spin text-stone-400" />
    </div>
  )

  if (error) return (
    <div className="py-12 text-center">
      <p className="text-sm text-red-500">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-light text-stone-800">Choose a service</h2>
        <p className="text-sm text-stone-400 mt-1">Select the treatment you'd like to book</p>
      </div>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">{cat}</p>
          <div className="space-y-2">
            {items.map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full text-left border border-stone-200 rounded-xl px-5 py-4 hover:border-stone-400 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-800 group-hover:text-stone-900">{s.name}</p>
                    {s.description && (
                      <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-stone-800">{formatCurrency(s.price)}</p>
                    <p className="text-xs text-stone-400 flex items-center gap-0.5 justify-end mt-0.5">
                      <Clock size={10} /> {s.duration_minutes} min
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Step 2: Date & Time ────────────────────────────────────────────────────────

function DateTimeStep({ service, selectedDate, selectedTime, onDateSelect, onTimeSelect, onBack }) {
  const today      = new Date()
  const todayStr   = toLocalDateString(today)

  // Calendar state — show a month at a time
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const [slots,         setSlots]         = useState([])
  const [loadingSlots,  setLoadingSlots]  = useState(false)
  const [slotsError,    setSlotsError]    = useState('')
  const [availableDates, setAvailableDates] = useState(new Set())
  const [loadingDates,  setLoadingDates]  = useState(false)

  // Fetch which dates in the current month have at least one open slot
  useEffect(() => {
    setLoadingDates(true)
    setAvailableDates(new Set())
    api.get('/public/available-dates', { params: { service_id: service.id, year: viewYear, month: viewMonth + 1 } })
      .then(r => setAvailableDates(new Set(r.data)))
      .catch(() => {})
      .finally(() => setLoadingDates(false))
  }, [service.id, viewYear, viewMonth])

  // Fetch slots when a date is picked
  useEffect(() => {
    if (!selectedDate) { setSlots([]); return }
    setLoadingSlots(true)
    setSlotsError('')
    api.get('/public/availability', { params: { service_id: service.id, date: selectedDate } })
      .then(r => setSlots(r.data))
      .catch(() => { setSlots([]); setSlotsError('Could not load availability. Please try again.') })
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, service.id])

  // Build calendar grid
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const maxDate     = new Date(today); maxDate.setDate(today.getDate() + 60)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const canGoPrev = !(viewYear === today.getFullYear() && viewMonth === today.getMonth())
  const canGoNext = new Date(viewYear, viewMonth + 1, 1) <= maxDate

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-light text-stone-800">Pick a date & time</h2>
          <p className="text-sm text-stone-400 mt-1">{service.name} · {service.duration_minutes} min · {formatCurrency(service.price)}</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-700 transition-colors">
          <ChevronLeft size={14} /> Back
        </button>
      </div>

      {/* Calendar */}
      <div className="border border-stone-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-200">
          <button onClick={prevMonth} disabled={!canGoPrev} className="p-1 rounded hover:bg-stone-200 disabled:opacity-30 transition-colors">
            <ChevronLeft size={16} className="text-stone-600" />
          </button>
          <span className="text-sm font-medium text-stone-700 flex items-center gap-2">
            {MONTH_NAMES[viewMonth]} {viewYear}
            {loadingDates && <Loader size={12} className="animate-spin text-stone-400" />}
          </span>
          <button onClick={nextMonth} disabled={!canGoNext} className="p-1 rounded hover:bg-stone-200 disabled:opacity-30 transition-colors">
            <ChevronRight size={16} className="text-stone-600" />
          </button>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs text-stone-400 font-medium py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const pad = n => String(n).padStart(2, '0')
              const dateStr    = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`
              const dt         = new Date(viewYear, viewMonth, day)
              const isPast     = dateStr < todayStr
              const isFuture   = dt > maxDate
              const isBooked   = !loadingDates && !isPast && !isFuture && !availableDates.has(dateStr)
              const isDisabled = isPast || isFuture || isBooked
              const isSelected = dateStr === selectedDate
              const isToday    = dateStr === todayStr

              return (
                <button
                  key={day}
                  disabled={isDisabled}
                  onClick={() => { onDateSelect(dateStr); onTimeSelect('') }}
                  title={isBooked ? 'Fully booked' : undefined}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all relative ${
                    isSelected
                      ? 'bg-stone-800 text-white font-medium'
                      : isDisabled
                      ? 'text-stone-200 cursor-not-allowed'
                      : 'hover:bg-stone-100 text-stone-700 cursor-pointer'
                  }`}
                >
                  {day}
                  {/* Availability dot — green when open, none when loading or past */}
                  {!isPast && !isFuture && !loadingDates && (
                    <span className={`absolute bottom-1 w-1 h-1 rounded-full ${
                      isSelected ? 'bg-white/60' : availableDates.has(dateStr) ? 'bg-emerald-400' : 'bg-stone-300'
                    }`} />
                  )}
                  {isToday && !isSelected && (
                    <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-stone-400" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
            Available times — {formatBookingDate(selectedDate)}
          </p>
          {loadingSlots ? (
            <div className="flex justify-center py-6">
              <Loader size={20} className="animate-spin text-stone-400" />
            </div>
          ) : slotsError ? (
            <p className="text-sm text-red-500 text-center py-6">{slotsError}</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-6">No availability on this date. Please try another day.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map(slot => (
                <button
                  key={slot}
                  onClick={() => onTimeSelect(slot)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    selectedTime === slot
                      ? 'bg-stone-800 text-white border-stone-800'
                      : 'border-stone-200 text-stone-700 hover:border-stone-400'
                  }`}
                >
                  {formatSlot(slot)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3: Patient details ────────────────────────────────────────────────────

function DetailsStep({ form, onChange, onBack, onNext }) {
  const valid = form.first_name && form.last_name && form.phone && form.email

  function handleSubmit(e) {
    e.preventDefault()
    if (valid) onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-light text-stone-800">Your details</h2>
          <p className="text-sm text-stone-400 mt-1">We'll use your phone number to identify returning clients</p>
        </div>
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-700 transition-colors">
          <ChevronLeft size={14} /> Back
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="First name" required value={form.first_name} onChange={e => onChange('first_name', e.target.value)} placeholder="Jane" />
        <Input label="Last name"  required value={form.last_name}  onChange={e => onChange('last_name', e.target.value)}  placeholder="Smith" />
      </div>
      <Input label="Phone number" required type="tel" value={form.phone} onChange={e => onChange('phone', e.target.value)} placeholder="(555) 000-0000" />
      <Input label="Email address" required type="email" value={form.email} onChange={e => onChange('email', e.target.value)} placeholder="jane@example.com" />
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1.5">Notes <span className="font-normal text-stone-400">(optional)</span></label>
        <textarea
          value={form.notes}
          onChange={e => onChange('notes', e.target.value)}
          rows={3}
          placeholder="Allergies, skin concerns, anything you'd like us to know…"
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-300 resize-none"
        />
      </div>

      <Btn type="submit" disabled={!valid}>
        Review Booking
        <ChevronRight size={16} />
      </Btn>
    </form>
  )
}

// ── Step 4: Confirm ────────────────────────────────────────────────────────────

function ConfirmStep({ service, selectedDate, selectedTime, form, onBack, onConfirm, confirming, error }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-light text-stone-800">Confirm your booking</h2>
          <p className="text-sm text-stone-400 mt-1">Review your appointment details before booking</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-700 transition-colors">
          <ChevronLeft size={14} /> Back
        </button>
      </div>

      <div className="border border-stone-200 rounded-xl divide-y divide-stone-100">
        <div className="px-5 py-4">
          <p className="text-xs text-stone-400 mb-0.5">Service</p>
          <p className="text-stone-800 font-medium">{service.name}</p>
          <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-2">
            <span className="flex items-center gap-1"><Clock size={10} />{service.duration_minutes} min</span>
            <span className="flex items-center gap-1"><DollarSign size={10} />{formatCurrency(service.price)}</span>
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-stone-400 mb-0.5">Date & Time</p>
          <p className="text-stone-800 font-medium">{formatBookingDate(selectedDate)}</p>
          <p className="text-sm text-stone-500">{formatSlot(selectedTime)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-stone-400 mb-0.5">Client</p>
          <p className="text-stone-800 font-medium">{form.first_name} {form.last_name}</p>
          <p className="text-sm text-stone-500">{form.phone}</p>
          <p className="text-sm text-stone-500">{form.email}</p>
          {form.notes && <p className="text-xs text-stone-400 mt-1 italic">"{form.notes}"</p>}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <Btn onClick={onConfirm} disabled={confirming}>
        {confirming ? <><Loader size={14} className="animate-spin" /> Booking…</> : 'Confirm Booking'}
      </Btn>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ confirmation, onBookAnother }) {
  return (
    <div className="text-center space-y-6 py-4">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle size={32} className="text-emerald-500" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-light text-stone-800">You're booked!</h2>
        <p className="text-stone-500 mt-1">
          See you on <span className="font-medium text-stone-700">{formatBookingDate(confirmation.scheduled_at.slice(0, 10))}</span>
        </p>
      </div>
      <div className="bg-stone-50 rounded-xl px-6 py-5 text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-stone-400">Service</span>
          <span className="text-stone-700 font-medium">{confirmation.service_name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-400">Time</span>
          <span className="text-stone-700">{formatSlot(confirmation.scheduled_at.slice(11, 16))}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-400">Duration</span>
          <span className="text-stone-700">{confirmation.duration_minutes} min</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-400">Price</span>
          <span className="text-stone-700">{formatCurrency(confirmation.price)}</span>
        </div>
      </div>
      <p className="text-xs text-stone-400">
        Confirmation #{confirmation.id} · {confirmation.patient_name}
        {confirmation.is_new_patient && ' · Welcome to OK Beauty Space!'}
      </p>
      <button
        onClick={onBookAnother}
        className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-800 transition-colors"
      >
        Book another appointment
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { first_name: '', last_name: '', phone: '', email: '', notes: '' }

export default function Book() {
  const [step,         setStep]        = useState(0)
  const [service,      setService]     = useState(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [confirming,   setConfirming]   = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const submitting = useRef(false)

  function updateForm(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function reset() {
    setStep(0)
    setService(null)
    setSelectedDate('')
    setSelectedTime('')
    setForm(EMPTY_FORM)
    setConfirmation(null)
    setBookingError('')
    submitting.current = false
  }

  async function confirm() {
    if (submitting.current) return
    submitting.current = true
    setConfirming(true)
    setBookingError('')
    try {
      const r = await api.post('/public/book', {
        service_id: service.id,
        date:       selectedDate,
        time:       selectedTime,
        ...form,
      })
      setConfirmation(r.data)
    } catch (err) {
      setBookingError(err.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setConfirming(false)
      submitting.current = false
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-light tracking-widest text-stone-800 uppercase">OK Beauty Space</h1>
        <p className="text-stone-400 text-sm tracking-wide mt-1">Book an Appointment</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 w-full max-w-lg p-8">
        {confirmation ? (
          <SuccessScreen confirmation={confirmation} onBookAnother={reset} />
        ) : (
          <>
            <StepIndicator current={step} />

            {step === 0 && (
              <ServiceStep onSelect={s => { setService(s); setSelectedDate(''); setSelectedTime(''); setStep(1) }} />
            )}
            {step === 1 && (
              <DateTimeStep
                service={service}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                onDateSelect={setSelectedDate}
                onTimeSelect={setSelectedTime}
                onBack={() => setStep(0)}
              />
            )}
            {step === 2 && (
              <DetailsStep
                form={form}
                onChange={updateForm}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && (
              <ConfirmStep
                service={service}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                form={form}
                onBack={() => setStep(2)}
                onConfirm={confirm}
                confirming={confirming}
                error={bookingError}
              />
            )}

            {/* Next button for step 1 */}
            {step === 1 && selectedDate && selectedTime && (
              <div className="mt-6 flex justify-end">
                <Btn onClick={() => setStep(2)}>
                  Continue <ChevronRight size={16} />
                </Btn>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-stone-400 mt-6">© OK Beauty Space · All appointments subject to confirmation</p>
    </div>
  )
}
