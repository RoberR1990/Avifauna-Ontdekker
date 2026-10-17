import { describe, expect, it, vi } from 'vitest'
import { CARD_H, CARD_W, drawCard, planCard, wrapText, type CardData, type CardPhoto } from './card'

export function mockCtx() {
  const texts: string[] = []
  const images: unknown[][] = []
  const target: Record<string, unknown> = {
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (s: string) => texts.push(s),
    drawImage: (...a: unknown[]) => images.push(a),
  }
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : (t[k] = vi.fn())),
    set: (t, k: string, v) => ((t[k] = v), true),
  }) as unknown as CanvasRenderingContext2D
  return { ctx, texts, images }
}

const img = {} as CanvasImageSource
const photo = (creator: string, license = 'CC BY-SA 4.0', loaded = true): CardPhoto => ({ img: loaded ? img : null, creator, license })

function base(over: Partial<CardData> = {}): CardData {
  return {
    appName: 'Avifauna Ontdekker',
    parkName: 'Vogelpark Test',
    unofficial: 'Onofficiële gids',
    dateLabel: 'zaterdag 17 oktober 2026',
    countLabel: '3 soorten gezien',
    favouriteLabel: 'Favoriet',
    favourite: { name: 'Flamingo', photo: photo('Anna') },
    thumbs: [
      { name: 'Pinguïn', photo: photo('Bob') },
      { name: 'Uil', photo: photo('Anna') },
    ],
    badgesLabel: 'Nieuwe badges',
    badges: ['Eerste sticker'],
    photosLabel: "Foto's:",
    ...over,
  }
}

describe('wrapText', () => {
  it('breekt op woorden', () => {
    const { ctx } = mockCtx()
    expect(wrapText(ctx, 'aaaa bbbb cccc', 90)).toEqual(['aaaa bbbb', 'cccc'])
  })
})

describe('planCard', () => {
  it('dedupliceert makers en past in twee regels', () => {
    const { ctx } = mockCtx()
    const plan = planCard(ctx, base())
    expect(plan.showPhotos).toBe(true)
    expect(plan.attributionLines.join(' ')).toBe("Foto's: Anna (CC BY-SA 4.0), Bob (CC BY-SA 4.0)")
  })

  it('laat foto’s weg als de attributie niet past', () => {
    const { ctx } = mockCtx()
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `Vogel ${i}`, photo: photo(`Heel Lange Maker Naam Nummer ${i}`) }))
    const plan = planCard(ctx, base({ thumbs: many }))
    expect(plan.showPhotos).toBe(false)
    expect(plan.attributionLines).toEqual([])
  })

  it('zonder geladen foto’s geen attributie', () => {
    const { ctx } = mockCtx()
    const plan = planCard(ctx, base({ favourite: { name: 'Flamingo', photo: photo('Anna', 'CC BY 4.0', false) }, thumbs: [] }))
    expect(plan).toEqual({ showPhotos: false, attributionLines: [] })
  })
})

describe('drawCard', () => {
  it('tekent teksten, foto’s en attributie op een canvas van 1080x1350', () => {
    expect(CARD_W).toBe(1080)
    expect(CARD_H).toBe(1350)
    const { ctx, texts, images } = mockCtx()
    drawCard(ctx, base())
    expect(texts).toEqual(
      expect.arrayContaining([
        'Avifauna Ontdekker',
        'zaterdag 17 oktober 2026',
        '3 soorten gezien',
        'Favoriet: Flamingo',
        'Nieuwe badges: Eerste sticker',
        'Onofficiële gids · Vogelpark Test',
      ]),
    )
    expect(texts.some((t) => t.startsWith("Foto's: Anna (CC BY-SA 4.0)"))).toBe(true)
    expect(images).toHaveLength(3)
  })

  it('toont de naam als de foto niet laadt', () => {
    const { ctx, texts, images } = mockCtx()
    drawCard(ctx, base({ favourite: { name: 'Flamingo', photo: photo('Anna', 'CC BY 4.0', false) }, thumbs: [{ name: 'Uil', photo: null }], badges: [] }))
    expect(images).toHaveLength(0)
    expect(texts).toEqual(expect.arrayContaining(['Flamingo', 'Uil']))
    expect(texts.some((t) => t.startsWith('Nieuwe badges'))).toBe(false)
    expect(texts.some((t) => t.startsWith("Foto's"))).toBe(false)
  })

  it('tekent maximaal zes thumbs', () => {
    const { ctx, images } = mockCtx()
    const eight = Array.from({ length: 8 }, (_, i) => ({ name: `V${i}`, photo: photo('Anna') }))
    drawCard(ctx, base({ thumbs: eight }))
    expect(images).toHaveLength(7)
  })
})
