// UW quarter boundaries as the hardware loans use them. A return date can't
// fall after the current quarter's end, and an extension (see
// extensionWindow) is how a loan is carried over the break into the next.

/**
 * Shown to the member asking for an extension and to the admin deciding it.
 * Deliberately not enforced anywhere — admins check it themselves.
 */
export const EXTENSION_GROUP_NOTICE = 'Extensions are only for loans for project groups.'

/** How long before a quarter ends that members can ask to extend a loan. */
export const EXTENSION_WINDOW_DAYS = 14

/** Local-calendar `YYYY-MM-DD` (not UTC, which can be a day off). */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * The latest return date allowed for a loan taken out on `today`: the end of
 * the quarter it falls in. `null` in the short gaps between quarters, when
 * no session is running.
 */
export function getQuarterEndDate(today: Date): string | null {
  const month = today.getMonth()
  const day = today.getDate()
  const year = today.getFullYear()

  if (month >= 8) return `${year}-12-15`
  if (month <= 1 || (month === 2 && day <= 20)) return `${year}-03-20`
  if ((month === 2 && day >= 21) || (month >= 3 && month <= 4) || (month === 5 && day <= 10)) {
    return `${year}-06-10`
  }
  if ((month === 5 && day >= 15) || month === 6 || (month === 7 && day <= 20)) {
    return `${year}-08-20`
  }
  return null
}

/** The end of the quarter after the one ending on `quarterEnd`. */
export function nextQuarterEndDate(quarterEnd: string): string {
  const year = Number(quarterEnd.slice(0, 4))
  switch (quarterEnd.slice(5)) {
    case '12-15':
      return `${year + 1}-03-20`
    case '03-20':
      return `${year}-06-10`
    case '06-10':
      return `${year}-08-20`
    case '08-20':
      return `${year}-12-15`
    default:
      throw new Error(`Not a quarter end date: ${quarterEnd}`)
  }
}

export interface ExtensionWindow {
  /** First day a member can ask for an extension. */
  opensOn: string
  /** Last day they can — the quarter's end date. */
  closesOn: string
  /** The latest new return date an extension can choose. */
  maxDate: string
  isOpen: boolean
}

/**
 * The extension window of the quarter `today` falls in, whether or not it
 * has opened yet. `null` between quarters.
 */
export function extensionWindow(today: Date): ExtensionWindow | null {
  const closesOn = getQuarterEndDate(today)
  if (!closesOn) return null

  // Calendar days, not 14 × 24h: the March window spans the switch to
  // daylight time, where millisecond arithmetic lands an hour short.
  const open = new Date(`${closesOn}T00:00:00`)
  open.setDate(open.getDate() - EXTENSION_WINDOW_DAYS)
  const opensOn = toISODate(open)
  const todayIso = toISODate(today)

  return {
    opensOn,
    closesOn,
    maxDate: nextQuarterEndDate(closesOn),
    isOpen: opensOn <= todayIso && todayIso <= closesOn,
  }
}
