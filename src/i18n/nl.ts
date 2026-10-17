export const nl = {
  'nav.home': 'Start',
  'nav.about': 'Over',
  'nav.main': 'Hoofdmenu',
  'skip.main': 'Naar de inhoud',
  'home.soon': 'Binnenkort: Vogelatlas, parkkaart en meer',
  'home.about_link': 'Over deze app',
  'about.title': 'Over deze app',
  'about.source': 'Broncode op GitHub',
  'about.official.title': 'Officiële website',
  'about.official.text':
    'Deze app is onofficieel en niet gemaakt door of met het park. We linken alleen naar de officiële website; daar vind je tickets, openingstijden en het dagprogramma.',
  'about.official.link': 'Naar de officiële website',
  'about.privacy.title': 'Privacy',
  'about.privacy.text':
    'Geen accounts, geen cookies, geen tracking. Je locatie wordt alleen op je eigen toestel gebruikt en nooit opgeslagen of verstuurd.',
  'about.data.title': 'Data en licenties',
  'about.data.text':
    'De code is vrij te gebruiken onder de MIT-licentie. Onze eigen data valt onder CC BY 4.0. Foto’s, geluiden en andere media hebben elk hun eigen licentie, die je bij het mediabestand terugvindt.',
  'notfound.title': 'Pagina niet gevonden',
  'notfound.back': 'Terug naar start',
} as const

export type Key = keyof typeof nl
