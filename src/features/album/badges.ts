// Badges: vaste app-badges (parkonafhankelijk, relatieve drempels) + expeditiebadges uit de bundel.
// Puur en getest; toekennen gebeurt via albumActions.earnBadge (zie sync.ts).
import type { ParkBundle } from '../../data/types'
import type { AlbumV1 } from '../../state/album'

export type AppBadgeId = 'eerste-sticker' | 'tien-stickers' | 'helft' | 'alle-confirmed' | 'drie-werelddelen' | 'bingo-vol'

export interface BadgeInfo {
  id: string
  name: string
  icon: string
  /** Uitleg hoe je de badge haalt. */
  how: string
  kind: 'app' | 'expedition'
}

export const APP_BADGES: { id: AppBadgeId; icon: string }[] = [
  { id: 'eerste-sticker', icon: '⭐' },
  { id: 'tien-stickers', icon: '🔟' },
  { id: 'helft', icon: '🌗' },
  { id: 'alle-confirmed', icon: '🏆' },
  { id: 'drie-werelddelen', icon: '🌍' },
  { id: 'bingo-vol', icon: '🎯' },
]

/** Sleutel in het woordenboek van de album-feature: `badge.<id>.name` / `badge.<id>.how`. */
export type BadgeText = (key: string) => string

/** Alle badges van dit park: vaste app-badges + één per expeditie. */
export function allBadges(bundle: ParkBundle, t: BadgeText): BadgeInfo[] {
  const app = APP_BADGES.map((b) => ({
    id: b.id,
    icon: b.icon,
    name: t(`badge.${b.id}.name`),
    how: t(`badge.${b.id}.how`),
    kind: 'app' as const,
  }))
  const seen = new Set<string>(app.map((b) => b.id))
  const exp: BadgeInfo[] = []
  for (const e of bundle.expeditions ?? []) {
    if (seen.has(e.badge.id)) continue
    seen.add(e.badge.id)
    exp.push({
      id: e.badge.id,
      icon: e.badge.icon,
      name: e.badge.name,
      how: t('badge.expedition.how').replace('{title}', e.title),
      kind: 'expedition',
    })
  }
  return [...app, ...exp]
}

/** Id's van app-badges die nu verdiend zijn (bingo-vol niet: die verdient de bingo zelf). */
export function earnedNow(album: AlbumV1, bundle: ParkBundle): AppBadgeId[] {
  const found = new Set(Object.keys(album.stickers))
  const confirmed = bundle.species.filter((s) => s.status === 'confirmed')
  const foundConfirmed = confirmed.filter((s) => found.has(s.slug)).length
  const continents = new Set<string>()
  for (const s of bundle.species) if (found.has(s.slug)) s.facts?.continents.forEach((c) => continents.add(c))

  const out: AppBadgeId[] = []
  if (found.size >= 1) out.push('eerste-sticker')
  if (found.size >= 10) out.push('tien-stickers')
  if (confirmed.length > 0 && foundConfirmed >= confirmed.length / 2) out.push('helft')
  if (confirmed.length > 0 && foundConfirmed === confirmed.length) out.push('alle-confirmed')
  if (continents.size >= 3) out.push('drie-werelddelen')
  return out
}
