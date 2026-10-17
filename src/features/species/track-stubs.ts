// Gebeurtenissen van de soortpagina. Nu no-ops; de statistieken-agent (src/lib/track.ts) sluit ze later aan.
import type { Level } from '../../data/types'

export function speciesView(slug: string): void {
  void slug
}

export function levelChange(level: Level): void {
  void level
}

export function readAloud(level: Level): void {
  void level
}

export function soundPlay(slug: string): void {
  void slug
}
