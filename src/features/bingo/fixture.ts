import type { BundleBingo } from '../../data/types'

export const fixtureSlugs = ['aap', 'beer', 'chinchilla', 'dodo', 'ekster', 'flamingo', 'gier', 'havik', 'ibis', 'jan-van-gent']

export const fixtureBingo: BundleBingo = {
  sizes: [9, 16],
  species_share: 0.6,
  behaviours: [
    { id: 'one-leg', icon: '🦩', label: 'Vogel op één poot', indoor_ok: true },
    { id: 'flying', icon: '🕊️', label: 'Vliegende vogel', indoor_ok: false },
    { id: 'swim', icon: '🦆', label: 'Zwemmende vogel', indoor_ok: false },
    { id: 'nest', icon: '🪹', label: 'Nest', indoor_ok: true },
    { id: 'feather', icon: '🪶', label: 'Veer op de grond', indoor_ok: false },
    { id: 'baby', icon: '🐣', label: 'Jong dier', indoor_ok: true },
  ],
  species: fixtureSlugs,
}
