const pad = (number: number) => String(number).padStart(2, '0')

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function localTime(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function isLocalDate(value: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export function isLocalTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date))
}

export function numberLabel(value: number) {
  return new Intl.NumberFormat('sk-SK', { maximumSignificantDigits: 6, maximumFractionDigits: 6 }).format(value)
}

export function decimal(value: string, label: string, allowZero = false): number | undefined {
  const input = value.trim()
  if (!input) return undefined
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(input)) throw new Error(`${label}: zadajte číslo.`)
  const number = Number(input.replace(',', '.'))
  if (!Number.isFinite(number) || (!allowZero && number <= 0)) {
    throw new Error(`${label}: zadajte ${allowZero ? 'nezáporné' : 'kladné'} číslo.`)
  }
  return number
}

export function requiredDecimal(value: string, label: string, allowZero = false) {
  const result = decimal(value, label, allowZero)
  if (result === undefined) throw new Error(`${label}: vyplňte hodnotu.`)
  return result
}

const dayMs = 86_400_000

/** UTC aritmetika slúži len na posun už určeného miestneho kalendárneho dňa. */
export function shiftDay(date: string, offset: number) {
  return new Date(Date.parse(date) + offset * dayMs).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string) {
  return (Date.parse(to) - Date.parse(from)) / dayMs
}

export function weekday(date: string) {
  return new Date(date).getUTCDay()
}
