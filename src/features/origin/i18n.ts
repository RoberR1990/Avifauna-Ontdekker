import type { Continent, Lang } from '../../data/types'

type Text = {
  continents: Record<Continent, string>
  mapOf: string
  livesIn: string
  is: string
  about: string
  away: string
  schematic: string
}

export const originText: Record<Lang, Text> = {
  nl: {
    continents: {
      africa: 'Afrika', asia: 'Azië', europe: 'Europa', 'north-america': 'Noord-Amerika',
      'south-america': 'Zuid-Amerika', oceania: 'Oceanië', antarctica: 'Antarctica',
    },
    mapOf: 'Wereldkaartje:',
    livesIn: 'leeft in het wild in',
    is: 'ligt',
    about: 'ongeveer',
    away: 'verderop',
    schematic: 'Schematisch kaartje.',
  },
  en: {
    continents: {
      africa: 'Africa', asia: 'Asia', europe: 'Europe', 'north-america': 'North America',
      'south-america': 'South America', oceania: 'Oceania', antarctica: 'Antarctica',
    },
    mapOf: 'World map:',
    livesIn: 'lives in the wild in',
    is: 'is',
    about: 'about',
    away: 'away',
    schematic: 'Simplified map.',
  },
}
