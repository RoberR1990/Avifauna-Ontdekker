// Middelgrote soortfoto's (800x600 webp, q70) en 4:3-thumbs (400x300) voor `srcset`, gemaakt bij het bouwen uit de grote foto.
// Zelfde bijsnijding als de weergave (object-fit: cover, gecentreerd), dus visueel identiek.
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export const mediumFileName = (bigFile: string): string => bigFile.replace(/\.webp$/, '-800.webp')

/** 4:3-thumb (400x300) die de pipeline-thumb vervangt: de weergave snijdt toch bij (cover), dus ~3x minder bytes. */
export const thumbFileName = (bigFile: string): string => bigFile.replace(/\.webp$/, '-thumb.webp')

export const defaultMediumDir = (): string => join(repoRoot, 'node_modules', '.cache', 'avifauna-medium')

/** Maakt ontbrekende of verouderde `<slug>-800.webp` aan in `outDir` (cache). */
export async function ensureMediums(parkDir: string, outDir: string): Promise<void> {
  const photosDir = join(parkDir, 'media', 'photos')
  if (!existsSync(photosDir)) return
  mkdirSync(outDir, { recursive: true })
  for (const name of readdirSync(photosDir)) {
    if (!name.endsWith('.webp') || name.endsWith('-thumb.webp') || name.endsWith('-800.webp')) continue
    const src = join(photosDir, name)
    const fresh = (dst: string) => existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs
    const mediumDst = join(outDir, mediumFileName(name))
    if (!fresh(mediumDst)) await sharp(src).resize(800, 600, { fit: 'cover', position: 'centre' }).webp({ quality: 70 }).toFile(mediumDst)
    const thumbDst = join(outDir, thumbFileName(name))
    if (!fresh(thumbDst)) await sharp(src).resize(400, 300, { fit: 'cover', position: 'centre' }).webp({ quality: 65 }).toFile(thumbDst)
  }
}
