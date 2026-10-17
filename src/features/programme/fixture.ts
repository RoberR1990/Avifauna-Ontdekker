// Testfixture voor het dagprogramma (programme.json van het park is nog leeg).
import type { Programme } from '../../park/types'

export const fixtureProgramme: Programme = {
  last_checked: '2026-10-10',
  source_url: 'https://example.org/programma',
  items: [
    { time: '14:12', title: { nl: 'Pinguïns voeren', en: 'Feeding the penguins' }, place_id: 'verblijf-pinguin', species: ['humboldtpinguin'] },
    { time: '13:30', title: { nl: 'Gisteren al begonnen' } },
    { time: '15:00', title: { nl: 'Roofvogelshow' }, days: ['sat', 'sun'], species: ['havik'] },
    { time: '15:30', title: { nl: 'Alleen op maandag' }, days: ['mon'] },
    { time: '14:40', title: { nl: 'Zomerrondleiding' }, season: { from: '05-01', to: '09-30' } },
    { time: '14:50', title: { nl: 'Winterrondleiding' }, season: { from: '11-01', to: '03-31' } },
    { time: '14:20', title: { nl: 'Herfstvoeren' }, season: { from: '10-01', to: '02-28' } },
    { time: '17:00', title: { nl: 'Te laat voor het venster' } },
  ],
}
