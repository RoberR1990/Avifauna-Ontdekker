// Tekent het "Vandaag gezien"-kaartje (1080x1350) op een canvas. Alles op het toestel; niets wordt verstuurd.
// De tekenfunctie krijgt een 2D-context en kant-en-klare afbeeldingen, zodat hij met een mock te testen is.
// Zie docs/FASE-2.md §6.4.

export const CARD_W = 1080
export const CARD_H = 1350
export const MAX_THUMBS = 6

export interface CardPhoto {
  /** Geladen afbeelding; null = laden mislukt (dan alleen de naam). */
  img: CanvasImageSource | null
  /** Alleen invullen voor attributie: wie en onder welke licentie. */
  creator: string
  license: string
}

export interface CardSpecies {
  name: string
  photo: CardPhoto | null
}

export interface CardData {
  appName: string
  parkName: string
  /** Bv. "Onofficiële gids". */
  unofficial: string
  dateLabel: string
  /** Bv. "5 soorten gezien". */
  countLabel: string
  favouriteLabel: string
  favourite: CardSpecies | null
  /** Tot MAX_THUMBS, zonder de favoriet. */
  thumbs: CardSpecies[]
  /** Bv. "Nieuwe badges". */
  badgesLabel: string
  badges: string[]
  /** Voorvoegsel, bv. "Foto's:". */
  photosLabel: string
}

export interface CardPlan {
  showPhotos: boolean
  /** Attributieregels (leeg als er geen foto's getoond worden). */
  attributionLines: string[]
}

const INK = '#231942'
const CREAM = '#fbf1de'
const SUN = '#ffc233'
const VIOLET = '#6a48d7'
const WHITE = '#fffdf7'
const HEAD = "'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif"
const BODY = "'Nunito', 'Trebuchet MS', Verdana, sans-serif"

const ATTR_FONT = `22px ${BODY}`
const ATTR_MAX_WIDTH = CARD_W - 120
const ATTR_MAX_LINES = 2

/** Unieke "maker (licentie)"-stukken van de getoonde foto's. */
export function attributionParts(photos: (CardPhoto | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of photos) {
    if (!p || !p.img) continue
    const part = `${p.creator} (${p.license})`
    if (!seen.has(part)) {
      seen.add(part)
      out.push(part)
    }
  }
  return out
}

/** Breekt tekst op woorden af op maxWidth. */
export function wrapText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Past de attributie in twee regels? Zo niet: foto's weglaten (en dus ook de attributie). */
export function planCard(ctx: Pick<CanvasRenderingContext2D, 'measureText' | 'font'>, data: CardData): CardPlan {
  const photos = [data.favourite?.photo, ...data.thumbs.map((s) => s.photo)]
  const parts = attributionParts(photos)
  if (parts.length === 0) return { showPhotos: false, attributionLines: [] }
  ctx.font = ATTR_FONT
  const lines = wrapText(ctx, `${data.photosLabel} ${parts.join(', ')}`, ATTR_MAX_WIDTH)
  if (lines.length > ATTR_MAX_LINES) return { showPhotos: false, attributionLines: [] }
  return { showPhotos: true, attributionLines: lines }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const i = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }
  return { w: i.naturalWidth || i.width || 1, h: i.naturalHeight || i.height || 1 }
}

/** Tekent een species-vak: foto (cover) in stickerrand, anders alleen de naam. */
function drawTile(ctx: CanvasRenderingContext2D, s: CardSpecies, x: number, y: number, w: number, h: number, showPhoto: boolean, nameSize: number) {
  roundRect(ctx, x, y, w, h, 24)
  ctx.fillStyle = WHITE
  ctx.fill()
  const img = showPhoto ? s.photo?.img : null
  if (img) {
    ctx.save()
    roundRect(ctx, x, y, w, h, 24)
    ctx.clip()
    const { w: iw, h: ih } = sizeOf(img)
    const scale = Math.max(w / iw, h / ih)
    const dw = iw * scale
    const dh = ih * scale
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    ctx.restore()
  } else {
    ctx.fillStyle = INK
    ctx.font = `700 ${nameSize}px ${HEAD}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.name, x + w / 2, y + h / 2, w - 24)
  }
  roundRect(ctx, x, y, w, h, 24)
  ctx.lineWidth = 6
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** Tekent het hele kaartje. Geeft het plan terug (of de foto's getoond zijn). */
export function drawCard(ctx: CanvasRenderingContext2D, data: CardData): CardPlan {
  const plan = planCard(ctx, data)

  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.lineWidth = 12
  ctx.strokeStyle = INK
  roundRect(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 40)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = VIOLET
  ctx.font = `700 64px ${HEAD}`
  ctx.fillText(data.appName, CARD_W / 2, 118, CARD_W - 120)
  ctx.fillStyle = INK
  ctx.font = `600 38px ${BODY}`
  ctx.fillText(data.dateLabel, CARD_W / 2, 176, CARD_W - 120)
  ctx.font = `700 52px ${HEAD}`
  ctx.fillText(data.countLabel, CARD_W / 2, 242, CARD_W - 120)

  if (data.favourite) {
    drawTile(ctx, data.favourite, 190, 276, 700, 390, plan.showPhotos, 64)
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 52px ${HEAD}`
    ctx.fillText(`${data.favouriteLabel}: ${data.favourite.name}`, CARD_W / 2, 734, CARD_W - 120)
  }

  if (data.badges.length > 0) {
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.font = `700 36px ${BODY}`
    ctx.fillText(`${data.badgesLabel}: ${data.badges.join(', ')}`, CARD_W / 2, 796, CARD_W - 120)
  }

  const thumbs = data.thumbs.slice(0, MAX_THUMBS)
  const tw = 300
  const th = 150
  const gap = 30
  const x0 = (CARD_W - (3 * tw + 2 * gap)) / 2
  thumbs.forEach((s, i) => {
    drawTile(ctx, s, x0 + (i % 3) * (tw + gap), 836 + Math.floor(i / 3) * (th + 20), tw, th, plan.showPhotos, 30)
  })

  ctx.fillStyle = SUN
  ctx.fillRect(60, 1186, CARD_W - 120, 6)
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 34px ${HEAD}`
  ctx.fillText(`${data.unofficial} · ${data.parkName}`, CARD_W / 2, 1238, CARD_W - 120)
  ctx.font = ATTR_FONT
  plan.attributionLines.forEach((line, i) => ctx.fillText(line, CARD_W / 2, 1282 + i * 30, CARD_W - 120))
  return plan
}

/** Laadt een afbeelding; null als dat mislukt of te lang duurt. */
export function loadImage(url: string, timeoutMs = 6000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null)
    const img = new Image()
    const timer = setTimeout(() => resolve(null), timeoutMs)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}
