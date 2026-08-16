// formats a javascript Date object into a 12h AM/PM time string
// based on https://gist.github.com/hjst/1326755
export function formatTime (dateObj: Date) {
  let hour: number | string = dateObj.getHours()
  let minute: number | string = dateObj.getMinutes()
  const ap = (hour > 11) ? 'p' : 'a'

  if (hour > 12) {
    hour -= 12
  } else if (hour === 0) {
    hour = '12'
  }

  if (minute < 10) {
    minute = '0' + minute
  }

  return hour + ':' + minute + ap
}

export function formatDate (dateObj: Date) {
  // Local, not UTC. toISOString() returns the UTC calendar day, which pairs
  // wrongly with formatTime() below (that one is local): a user who joined at
  // 11:57pm Lima was shown "2026-08-16 11:57p" — tomorrow's date beside
  // tonight's time. Anything after 7pm in Lima showed the wrong day.
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function formatDateTime (dateObj: Date) {
  return (formatDate(dateObj) + ' ' + formatTime(dateObj))
}

export function formatDuration (sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60

  return `${m}:${s < 10 ? '0' + s : s}`
}

export function formatSeconds (sec: number, fuzzy = false) {
  if (sec >= 60 && fuzzy) return Math.round(sec / 60) + 'm'

  const m = Math.floor(sec / 60)
  const s = sec % 60

  return m ? `${m}m ${s}s` : `${s}s`
}
