// Stickervel als PNG (canvas, alleen op het toestel; er wordt niets verstuurd).
export interface SheetItem {
  name: string
  date: string
  photoUrl: string | null
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s}…`
}

/** Breekt tekst af op woorden zodat elke regel binnen max past. */
export function wrapLines(measure: (s: string) => number, text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > max) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

/**
 * Tekent het vel; null als canvas niet beschikbaar is.
 * credits: fotoattributie (verplicht bij CC BY/BY-SA), footer: onofficiële vermelding van het park.
 */
export async function renderSheet(title: string, items: SheetItem[], credits: string[] = [], footer = ''): Promise<Blob | null> {
  const cols = 3
  const cell = 360
  const gap = 40
  const head = 150
  const rows = Math.max(1, Math.ceil(items.length / cols))
  const w = cols * cell + (cols + 1) * gap
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const creditFont = '500 22px "Nunito", "Trebuchet MS", sans-serif'
  ctx.font = creditFont
  const creditLines = [...credits, footer].filter(Boolean).flatMap((c) => wrapLines((x) => ctx.measureText(x).width, c, w - 2 * gap))
  const lineH = 30
  const gridH = head + rows * (cell + 90)
  const h = gridH + (creditLines.length ? gap + creditLines.length * lineH : 0) + gap
  canvas.width = w
  canvas.height = h
  ctx.fillStyle = '#fffdf7'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#231942'
  ctx.font = '700 64px "Fredoka", "Trebuchet MS", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(fit(ctx, title, w - 2 * gap), gap, head / 2)
  const images = await Promise.all(items.map((i) => (i.photoUrl ? loadImage(i.photoUrl) : Promise.resolve(null))))
  items.forEach((item, n) => {
    const x = gap + (n % cols) * (cell + gap)
    const y = head + Math.floor(n / cols) * (cell + 90)
    ctx.fillStyle = '#e9e2ff'
    ctx.fillRect(x, y, cell, cell)
    const img = images[n]
    if (img) {
      const r = Math.max(cell / img.width, cell / img.height)
      const dw = img.width * r
      const dh = img.height * r
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, cell, cell)
      ctx.clip()
      ctx.drawImage(img, x + (cell - dw) / 2, y + (cell - dh) / 2, dw, dh)
      ctx.restore()
    }
    ctx.strokeStyle = '#231942'
    ctx.lineWidth = 8
    ctx.strokeRect(x, y, cell, cell)
    ctx.fillStyle = '#231942'
    ctx.font = '700 34px "Fredoka", "Trebuchet MS", sans-serif'
    ctx.fillText(fit(ctx, item.name, cell), x, y + cell + 30)
    ctx.font = '600 26px "Nunito", "Trebuchet MS", sans-serif'
    ctx.fillText(item.date, x, y + cell + 66)
  })
  ctx.fillStyle = '#231942'
  ctx.font = creditFont
  creditLines.forEach((line, i) => ctx.fillText(line, gap, gridH + gap + i * lineH))
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
