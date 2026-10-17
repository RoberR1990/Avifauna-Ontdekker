import { Link, useParams } from 'react-router-dom'
import { useSpecies } from '../../data/ParkDataProvider'
import { useT } from '../../i18n'

// Placeholder: de feature-agent vervangt dit bestand (zelfde export).
export function SpeciesPage() {
  const t = useT()
  const { slug } = useParams()
  const species = useSpecies(slug)
  return (
    <div className="species-page">
      <h1>{species?.name ?? slug}</h1>
      {species ? (
        <p className="latin">{species.scientific_name}</p>
      ) : (
        <>
          <p>{t('species.notfound')}</p>
          <Link className="btn" to="/atlas">
            {t('species.back')}
          </Link>
        </>
      )}
    </div>
  )
}
