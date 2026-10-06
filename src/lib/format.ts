const LOCALE = 'es-ES'
const TIME_ZONE = 'Europe/Madrid'

const euro = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function formatEuros(cents: number) {
  return euro.format(Math.round(cents / 100))
}

/** Dates are plain `YYYY-MM-DD` service days; noon UTC avoids day shifts. */
function serviceDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`)
}

const dayParts = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' })

const weekdayFormat = dayParts({ weekday: 'long' })
const monthFormat = dayParts({ month: 'short' })
const longFormat = dayParts({ weekday: 'long', day: 'numeric', month: 'long' })

export function dateParts(isoDate: string) {
  const date = serviceDay(isoDate)
  return {
    day: String(date.getUTCDate()),
    month: monthFormat.format(date).replace('.', ''),
    weekday: weekdayFormat.format(date),
    long: longFormat.format(date),
  }
}

const monthLongFormat = dayParts({ month: 'long' })

/** "1, 2 y 3 de octubre" or "30 y 31 de octubre y 1 de noviembre"; one day if `end` is not later. */
export function routeDaysLabel(start: string, end?: string) {
  const total = end && end > start ? Math.min(14, daysBetween(start, end) + 1) : 1
  const groups: { month: string; days: number[] }[] = []
  for (let offset = 0; offset < total; offset += 1) {
    const date = new Date(serviceDay(start).getTime() + offset * 86_400_000)
    const month = monthLongFormat.format(date)
    const group = groups.at(-1)
    if (group?.month === month) group.days.push(date.getUTCDate())
    else groups.push({ month, days: [date.getUTCDate()] })
  }
  return groups
    .map(({ month, days }) => {
      const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : `${days[0]}`
      return `${list} de ${month}`
    })
    .join(' y ')
}

/** Today's service day in Spain as `YYYY-MM-DD`. */
export function todayInSpain(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((serviceDay(toIso).getTime() - serviceDay(fromIso).getTime()) / 86_400_000)
}

export function relativeDayLabel(days: number) {
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Mañana'
  return `En ${days} días`
}

/** Short FNV-1a hash used to skip DOM updates when rendered markup has not changed. */
export function signature(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
