import type { ParkBundle } from '../../data/types'
import { albumActions, getAlbum } from '../../state/album'
import { earnedNow } from './badges'

/** Kent verdiende drempelbadges toe (idempotent). Geeft de nieuw verdiende id's terug. */
export function syncBadges(bundle: ParkBundle): string[] {
  const fresh: string[] = []
  for (const id of earnedNow(getAlbum(), bundle)) {
    if (getAlbum().badges[id]) continue
    albumActions.earnBadge(id)
    fresh.push(id)
  }
  return fresh
}
