import type { BundleSpecies } from '../data/types'

/** Dagnummer in lokale tijd (dezelfde datum geeft hetzelfde getal). */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/**
 * Vogel van de dag: deterministisch op datum. Volgorde op slug (taalonafhankelijk);
 * soorten met foto gaan voor zodra er minstens één is.
 */
export function birdOfTheDay(species: BundleSpecies[], date: Date = new Date()): BundleSpecies | null {
  if (species.length === 0) return null
  const withPhoto = species.filter((s) => s.photo)
  const pool = [...(withPhoto.length ? withPhoto : species)].sort((a, b) => a.slug.localeCompare(b.slug))
  return pool[dayNumber(date) % pool.length]
}
