// Kleine bundel voor tests van expedities en Spelen (de echte bundel krijgt expedities pas met W1).
import type { BundleExpedition, BundleStop, ParkBundle } from '../../data/types'
import type { PlaceFeature } from '../../park/types'

export const ZONE_A: PlaceFeature = {
  type: 'Feature',
  properties: { id: 'zone-a', kind: 'zone', name_nl: 'Zone A', source: 'osm' } as PlaceFeature['properties'],
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [4.0, 51.0],
        [4.002, 51.0],
        [4.002, 51.001],
        [4.0, 51.001],
        [4.0, 51.0],
      ],
    ],
  },
}

export const INSIDE = { lat: 51.0005, lon: 4.001, accuracy: 8 }
export const FAR = { lat: 51.01, lon: 4.001, accuracy: 8 }

function stop(id: string, over: Partial<BundleStop> & { task: BundleStop['task'] }): BundleStop {
  return { id, title: `Stop ${id}`, zone_id: 'zone-a', place_id: null, species: null, indoor: false, ...over }
}

export const EXP1: BundleExpedition = {
  id: 'e1',
  title: 'Vogelspeurtocht',
  intro: 'Zoek de vogels.',
  age: '4-6',
  minutes: 30,
  season: null,
  badge: { id: 'badge-e1', name: 'Speurneus', icon: '🔍' },
  stops: [
    stop('s1', { title: 'Bij de vijver', species: 'aap', task: { type: 'find', prompt: 'Vind de aap.', options: null, answer: null, hint: null } }),
    stop('s2', {
      indoor: true,
      task: { type: 'choose', prompt: 'Welke kleur?', options: ['Rood', 'Blauw', 'Groen'], answer: 1, hint: 'Kijk naar het bordje.' },
    }),
    stop('s3', {
      indoor: true,
      task: { type: 'count', prompt: 'Hoeveel eieren?', options: null, answer: 3, hint: 'Tel nog eens.' },
    }),
    stop('s4', { task: { type: 'count', prompt: 'Tel de eenden.', options: null, answer: null, hint: null } }),
  ],
}

/** Eén binnenstop: handig om te voltooien. */
export const EXP2: BundleExpedition = {
  id: 'e2',
  title: 'Korte tocht',
  intro: 'Maar een stop.',
  age: 'all',
  minutes: null,
  season: null,
  badge: { id: 'badge-e2', name: 'Kort maar krachtig', icon: '⭐' },
  stops: [
    stop('t1', {
      indoor: true,
      task: { type: 'choose', prompt: 'Kies goed.', options: ['Fout', 'Goed'], answer: 1, hint: null },
    }),
  ],
}

export function makeBundle(expeditions: BundleExpedition[]): ParkBundle {
  return {
    lang: 'nl',
    species: [
      {
        slug: 'aap',
        name: 'Aap',
        photo: { url: 'park/media/photos/aap.webp', thumb_url: 'park/media/photos/aap-thumb.webp', attribution: 0 },
      },
    ],
    places: { type: 'FeatureCollection', features: [ZONE_A] },
    attributions: [],
    expeditions,
  } as unknown as ParkBundle
}
