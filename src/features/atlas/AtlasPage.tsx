import { Link } from 'react-router-dom'
import { mediaUrl, useBundle } from '../../data/ParkDataProvider'

// Voorlopige lijst (preview); de atlas-agent vervangt dit bestand (zelfde export).
export function AtlasPage() {
  const bundle = useBundle()
  return (
    <>
      <h1>Atlas (voorlopig)</h1>
      <ul className="tiles">
        {bundle.species.map((s) => (
          <li key={s.slug}>
            <Link className="tile" to={`/soort/${s.slug}`}>
              {s.photo && <img src={mediaUrl(s.photo.thumb_url)} alt="" width={120} loading="lazy" />}
              <span>{s.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
