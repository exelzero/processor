import { useMemo } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import './AppointmentCalendar.css'

/**
 * Calendar view for appointments, styled to match the Processor UI.
 *
 * Uses react-big-calendar with the date-fns localizer. Defaults to week
 * view — the most practical for daily operations since Oksana can see
 * all booked slots at a glance without scrolling through a list.
 *
 * Event blocks are color-coded by service category so appointments are
 * scannable at a glance. Duration drives block height — a 60-min HydraFacial
 * takes twice the vertical space of a 30-min consultation.
 *
 * Interactions:
 *   - Click an empty time slot → opens booking panel with date/time pre-filled
 *   - Click an existing appointment block → opens edit panel
 */

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
})

// Color palette per service category — muted tones to match the stone aesthetic
const CATEGORY_COLORS = {
  Facial:       { bg: '#e0f2fe', border: '#38bdf8', text: '#0369a1' },
  Treatment:    { bg: '#d1fae5', border: '#34d399', text: '#065f46' },
  Advanced:     { bg: '#ede9fe', border: '#a78bfa', text: '#5b21b6' },
  Consultation: { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' },
  Other:        { bg: '#f5f5f4', border: '#a8a29e', text: '#57534e' },
}

function colorForCategory(category) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other
}

/**
 * Transform a raw appointment object from the API into the shape
 * react-big-calendar expects: { title, start, end, resource }
 */
function toCalendarEvent(appt) {
  const start = new Date(appt.scheduled_at)
  const end = new Date(start.getTime() + (appt.service_duration_minutes ?? 60) * 60_000)
  return {
    id: appt.id,
    title: appt.patient_name ?? 'Unknown',
    start,
    end,
    resource: appt, // full appointment stored here for edit panel access
  }
}

export default function AppointmentCalendar({ appointments, onSelectSlot, onSelectEvent }) {
  const events = useMemo(() => appointments.map(toCalendarEvent), [appointments])

  // Apply category-based colors to each event block
  function eventPropGetter(event) {
    const { bg, border, text } = colorForCategory(event.resource?.service_category)
    return {
      style: {
        backgroundColor: bg,
        borderLeft: `3px solid ${border}`,
        color: text,
        borderRadius: '6px',
        fontSize: '12px',
        padding: '2px 6px',
      },
    }
  }

  // Show "Patient — Service" as the event label inside the block
  function EventComponent({ event }) {
    return (
      <div className="leading-tight">
        <span className="font-medium">{event.title}</span>
        {event.resource?.service_name && (
          <span className="block opacity-75 text-xs">{event.resource.service_name}</span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden" style={{ height: 680 }}>
      <Calendar
        localizer={localizer}
        events={events}
        defaultView="week"
        views={['month', 'week', 'day', 'agenda']}
        step={15}           // 15-minute grid slots
        timeslots={4}       // 4 slots per hour = 15min each
        min={new Date(0, 0, 0, 8, 0)}   // start at 8am
        max={new Date(0, 0, 0, 20, 0)}  // end at 8pm
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={event => onSelectEvent(event.resource)}
        eventPropGetter={eventPropGetter}
        components={{ event: EventComponent }}
        popup  // show "+N more" popup on month view when day is full
      />
    </div>
  )
}
