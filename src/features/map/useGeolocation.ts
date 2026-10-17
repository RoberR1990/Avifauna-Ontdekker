import { useEffect, useState } from 'react'

export type GeoStatus = 'idle' | 'searching' | 'active' | 'denied' | 'unavailable' | 'error'
export interface Fix {
  lat: number
  lon: number
  accuracy: number
}

/**
 * Volgt de positie zolang `enabled` waar is. Pas dan wordt geolocation aangeroepen.
 * De positie leeft alleen in deze state: niet opgeslagen, niet gelogd, niet verstuurd.
 * Bij uitzetten en bij unmount wordt clearWatch aangeroepen.
 */
export function useGeolocation(enabled: boolean): { status: GeoStatus; fix: Fix | null } {
  const [res, setRes] = useState<{ status: GeoStatus; fix: Fix | null }>({ status: 'idle', fix: null })

  useEffect(() => {
    if (!enabled) return
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    if (!geo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRes({ status: 'unavailable', fix: null })
      return
    }
    setRes({ status: 'searching', fix: null })
    const id = geo.watchPosition(
      (p) => setRes({ status: 'active', fix: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => setRes({ status: e.code === 1 ? 'denied' : e.code === 2 ? 'unavailable' : 'error', fix: null }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => {
      geo.clearWatch(id)
    }
  }, [enabled])

  return enabled ? res : { status: 'idle', fix: null }
}
