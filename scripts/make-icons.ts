// Genereert de PNG-pictogrammen uit public/icon.svg. Gebruik: pnpm exec tsx scripts/make-icons.ts
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icon.svg')
for (const size of [192, 512]) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(`public/icon-${size}.png`)
}
// maskable: volledige achtergrond (geen cirkel) zodat het OS kan bijsnijden
const maskable = Buffer.from(
  readFileSync('public/icon.svg', 'utf8').replace('<circle cx="256" cy="256" r="256"', '<rect width="512" height="512"'),
)
await sharp(maskable, { density: 300 }).resize(512, 512).png().toFile('public/icon-maskable-512.png')
