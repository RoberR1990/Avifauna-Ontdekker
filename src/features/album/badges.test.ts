import { describe, expect, it } from 'vitest'
import type { ParkBundle } from '../../data/types'
import { emptyAlbum, withSticker, type AlbumV1 } from '../../state/album'
import { allBadges, earnedNow } from './badges'

function sp(slug: string, status: string, continents: string[] = []) {
  return { slug, status, facts: { continents } }
}

const species = [
  ...Array.from({ length: 12 }, (_, i) => sp(`c${i}`, 'confirmed', i === 0 ? ['africa'] : i === 1 ? ['asia'] : i === 2 ? ['europe'] : [])),
  sp('d1', 'draft'),
]
const bundle = {
  species,
  expeditions: [{ id: 'e1', title: 'Pinguinroute', badge: { id: 'badge-e1', name: 'Pinguinvriend', icon: '🐧' }, stops: [] }],
} as unknown as ParkBundle

const t = (k: string) => k
const album = (slugs: string[]): AlbumV1 => slugs.reduce((a, s) => withSticker(a, s, '2026-10-01'), emptyAlbum())

describe('allBadges', () => {
  it('geeft app-badges en expeditiebadges', () => {
    const b = allBadges(bundle, t)
    expect(b.filter((x) => x.kind === 'app').map((x) => x.id)).toEqual([
      'eerste-sticker', 'tien-stickers', 'helft', 'alle-confirmed', 'drie-werelddelen', 'bingo-vol',
    ])
    const e = b.find((x) => x.kind === 'expedition')
    expect(e).toMatchObject({ id: 'badge-e1', name: 'Pinguinvriend', icon: '🐧' })
    expect(e?.how).toContain('badge.expedition.how')
  })
})

describe('earnedNow', () => {
  it('niets bij een leeg album', () => {
    expect(earnedNow(emptyAlbum(), bundle)).toEqual([])
  })

  it('eerste sticker', () => {
    expect(earnedNow(album(['c5']), bundle)).toEqual(['eerste-sticker'])
  })

  it('tien stickers (ook draft telt) en helft', () => {
    const ids = earnedNow(album(['c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'd1', 'c11']), bundle)
    expect(ids).toEqual(expect.arrayContaining(['eerste-sticker', 'tien-stickers']))
    expect(earnedNow(album(['c3', 'c4', 'c5', 'c6', 'c7']), bundle)).not.toContain('helft')
    expect(earnedNow(album(['c3', 'c4', 'c5', 'c6', 'c7', 'c8']), bundle)).toContain('helft')
  })

  it('alle confirmed, nooit bingo-vol', () => {
    const ids = earnedNow(album(species.filter((s) => s.status === 'confirmed').map((s) => s.slug)), bundle)
    expect(ids).toContain('alle-confirmed')
    expect(ids).not.toContain('bingo-vol')
  })

  it('drie werelddelen', () => {
    expect(earnedNow(album(['c0', 'c1']), bundle)).not.toContain('drie-werelddelen')
    expect(earnedNow(album(['c0', 'c1', 'c2']), bundle)).toContain('drie-werelddelen')
  })
})
