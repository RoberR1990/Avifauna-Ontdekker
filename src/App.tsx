import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoadingScreen, ParkDataGate } from './data/ParkDataProvider'
import { About } from './pages/About'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'

// Feature-pagina's apart laden, zodat de kern klein blijft.
const AtlasPage = lazy(() => import('./features/atlas/AtlasPage').then((m) => ({ default: m.AtlasPage })))
const SpeciesPage = lazy(() => import('./features/species/SpeciesPage').then((m) => ({ default: m.SpeciesPage })))
const ParkMapPage = lazy(() => import('./features/map/ParkMapPage').then((m) => ({ default: m.ParkMapPage })))
const ToddlerPage = lazy(() => import('./features/toddler/ToddlerPage').then((m) => ({ default: m.ToddlerPage })))
const SourcesPage = lazy(() => import('./features/sources/SourcesPage').then((m) => ({ default: m.SourcesPage })))

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="over" element={<About />} />
          {/* Routes die de parkbundel nodig hebben: laad- of foutscherm tot hij er is. */}
          <Route element={<ParkDataGate />}>
            <Route path="atlas" element={<AtlasPage />} />
            <Route path="soort/:slug" element={<SpeciesPage />} />
            <Route path="kaart" element={<ParkMapPage />} />
            <Route path="peuter" element={<ToddlerPage />} />
            <Route path="bronnen" element={<SourcesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
