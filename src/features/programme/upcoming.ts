// Dagprogramma: wat begint er straks? Puur en zonder klok-afhankelijkheid (now wordt meegegeven).
// Tijdzone = die van het toestel (lokale getters). Zie docs/FASE-2.md §6.5.
import type { Programme, ProgrammeItem, Season, Weekday } from '../../park/types'

export interface UpcomingItem extends ProgrammeItem {
  /** Hele minuten tot de start (0 = nu). */
  minutesUntil: number
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const p2 = (n: number) => String(n).padStart(2, '0')

/** Seizoen MM-DD..MM-DD (inclusief); from > to loopt over de jaargrens. */
export function inSeason(season: Season | undefined | null, now: Date): boolean {
  if (!season) return true
  const md = `${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
  return season.from <= season.to ? md >= season.from && md <= season.to : md >= season.from || md <= season.to
}

function startMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? null : h * 60 + min
}

function runsToday(item: ProgrammeItem, now: Date): boolean {
  if (item.days && item.days.length > 0 && !item.days.includes(WEEKDAYS[now.getDay()])) return false
  return inSeason(item.season, now)
}

/** Items van vandaag die binnen `windowMin` minuten beginnen, op volgorde van starttijd. */
export function upcoming(programme: Programme | null | undefined, now: Date, windowMin = 120): UpcomingItem[] {
  if (!programme) return []
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const out: UpcomingItem[] = []
  for (const item of programme.items) {
    const start = startMinutes(item.time)
    if (start === null || !runsToday(item, now)) continue
    const minutesUntil = start - nowMin
    if (minutesUntil < 0 || minutesUntil > windowMin) continue
    out.push({ ...item, minutesUntil })
  }
  return out.sort((a, b) => a.minutesUntil - b.minutesUntil)
}

/** Eerstvolgende item van vandaag (vanaf nu) waarin deze soort voorkomt. */
export function nextForSpecies(programme: Programme | null | undefined, slug: string, now: Date): UpcomingItem | null {
  const all = upcoming(programme, now, 24 * 60)
  return all.find((i) => i.species?.includes(slug)) ?? null
}
