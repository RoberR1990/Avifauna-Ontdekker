import { Link, useParams } from 'react-router-dom'
import { mediaUrl, useBundle, useSpecies } from '../../data/ParkDataProvider'
import { useT } from '../../i18n'
import { useSettings } from '../../state/settings'
import { BirdOMeter } from '../meter/BirdOMeter'
import { OriginMap } from '../origin/OriginMap'

// Voorlopige preview (foto, Vogel-o-meter, herkomst); de soortpagina-agent vervangt dit bestand (zelfde export).
export function SpeciesPage() {
  const t = useT()
  const { lang } = useSettings()
  const bundle = useBundle()
  const { slug } = useParams()
  const species = useSpecies(slug)
  if (!species)
    return (
      <div className="species-page">
        <p>{t('species.notfound')}</p>
        <Link className="btn" to="/atlas">
          {t('species.back')}
        </Link>
      </div>
    )
  return (
    <div className="species-page">
      {species.photo && <img src={mediaUrl(species.photo.url)} alt={species.name} style={{ width: '100%', borderRadius: 16 }} />}
      <h1>{species.name}</h1>
      <p className="latin">{species.scientific_name}</p>
      <BirdOMeter species={species} lang={lang} />
      <OriginMap species={species} lang={lang} parkCenter={bundle.park.center ?? null} parkName={bundle.park.park_name} />
    </div>
  )
}
