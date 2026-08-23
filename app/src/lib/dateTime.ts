/**
 * Times, dates and durations in the reader's language.
 *
 * All of it goes through Intl, which is why there is no 12h/24h switch here:
 * an English reader gets "11:57 PM" and a Spanish one "23:57" because that is
 * what their locale says, not because this file decided.
 *
 * Everything is local, never UTC. toISOString() returns the UTC calendar day,
 * which pairs wrongly with a local time: a user who joined at 11:57pm in Lima
 * was shown tomorrow's date beside tonight's time, and anything after 7pm
 * showed the wrong day.
 */
import i18n from './i18n'

/** i18n.language is the single source of truth; read it per call, not once */
const locale = () => i18n.language || 'en'

const cache = new Map<string, Intl.DateTimeFormat>()

function formatter (kind: 'time' | 'date', loc: string): Intl.DateTimeFormat {
  const key = kind + ':' + loc
  let fmt = cache.get(key)

  if (!fmt) {
    fmt = kind === 'time'
      ? new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' })
      : new Intl.DateTimeFormat(loc, { year: 'numeric', month: '2-digit', day: '2-digit' })
    cache.set(key, fmt)
  }

  return fmt
}

export function formatTime (dateObj: Date) {
  return formatter('time', locale()).format(dateObj)
}

export function formatDate (dateObj: Date) {
  return formatter('date', locale()).format(dateObj)
}

export function formatDateTime (dateObj: Date) {
  return formatDate(dateObj) + ' ' + formatTime(dateObj)
}

/**
 * A running time, as it is written on a track listing. Digits and a colon
 * everywhere, so it stays out of the translation files.
 */
export function formatDuration (sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60

  return `${m}:${s < 10 ? '0' + s : s}`
}

/** an elapsed span said in words ("2m 5s"), so the units need translating */
export function formatSeconds (sec: number, fuzzy = false) {
  if (sec >= 60 && fuzzy) return i18n.t('common.minutesShort', { count: Math.round(sec / 60) })

  const m = Math.floor(sec / 60)
  const s = sec % 60

  return m
    ? i18n.t('common.minutesSecondsShort', { minutes: m, seconds: s })
    : i18n.t('common.secondsShort', { count: s })
}
