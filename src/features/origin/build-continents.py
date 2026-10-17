"""Genereert continents.ts uit Natural Earth 110m (admin 0 - countries, publiek domein).

Gebruik: python build-continents.py <ne_110m_admin_0_countries.geojson> > continents.ts
Bron: https://www.naturalearthdata.com/ (publiek domein), via
https://github.com/nvkelso/natural-earth-vector. Projectie: equirectangulair,
x = lon + 180, y = 90 - lat (viewBox 0 0 360 180). Landen worden per continent
(eigenschap CONTINENT) samengevoegd; Rusland wordt bij lengtegraad 60 gesplitst
(west = Europa, oost = Azie); Frans-Guyana gaat naar Zuid-Amerika.
"""
import json, math, sys

TOL = 0.7      # Douglas-Peucker, graden
MIN_AREA = 3.0 # kleinere ringen vallen af (graden^2)
KEY = {'Africa': 'africa', 'Asia': 'asia', 'Europe': 'europe', 'North America': 'north-america',
       'South America': 'south-america', 'Oceania': 'oceania', 'Antarctica': 'antarctica'}

def area(r):
    return abs(sum(r[i][0]*r[(i+1) % len(r)][1] - r[(i+1) % len(r)][0]*r[i][1] for i in range(len(r)))) / 2

def dp(pts, tol):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2-x1, y2-y1
    n = math.hypot(dx, dy)
    best, idx = -1, 0
    for i in range(1, len(pts)-1):
        x, y = pts[i]
        d = math.hypot(x-x1, y-y1) if n == 0 else abs(dy*x - dx*y + x2*y1 - y2*x1) / n
        if d > best: best, idx = d, i
    if best <= tol: return [pts[0], pts[-1]]
    return dp(pts[:idx+1], tol)[:-1] + dp(pts[idx:], tol)

def clip_lon(ring, lon, keep_east):
    def inside(p): return p[0] >= lon if keep_east else p[0] <= lon
    out = []
    for i in range(len(ring)):
        a, b = ring[i-1], ring[i]
        if inside(b):
            if not inside(a):
                t = (lon-a[0])/(b[0]-a[0]); out.append((lon, a[1]+t*(b[1]-a[1])))
            out.append(b)
        elif inside(a):
            t = (lon-a[0])/(b[0]-a[0]); out.append((lon, a[1]+t*(b[1]-a[1])))
    return out

def main(src):
    gj = json.load(open(src, encoding='utf8'))
    rings = {k: [] for k in KEY.values()}
    for f in gj['features']:
        p = f['properties']; cont = KEY.get(p['CONTINENT'])
        if not cont: continue
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            ring = [tuple(c[:2]) for c in poly[0]][:-1]
            if p['ADMIN'] == 'Russia' and any(c[0] < 60 for c in ring) and any(c[0] > 60 for c in ring):
                rings['europe'].append(clip_lon(ring, 60, False))
                rings['asia'].append(clip_lon(ring, 60, True))
            else:
                if cont == 'europe' and sum(c[0] for c in ring)/len(ring) < -20:
                    cont = 'south-america'  # Frans-Guyana (hoort bij Frankrijk in Natural Earth)
                rings[cont].append(ring)
    out = {}
    for cont, rs in rings.items():
        d = []
        for r in rs:
            if len(r) < 3 or area(r) < MIN_AREA: continue
            s = dp(r + [r[0]], TOL)[:-1]
            if len(s) < 3: continue
            pts = [(round(x+180, 1), round(90-y, 1)) for x, y in s]
            d.append('M' + 'L'.join(f'{x:g} {y:g}' for x, y in pts) + 'Z')
        out[cont] = ''.join(d)
    print('// GENERATED door build-continents.py uit Natural Earth 110m (publiek domein). Niet met de hand bewerken.')
    print('// Equirectangulair: x = lon + 180, y = 90 - lat, viewBox 0 0 360 180.')
    print("import type { Continent } from '../../data/types'\n")
    print('export const WORLD_VIEWBOX = \'0 0 360 180\'\n')
    print('export const CONTINENT_PATHS: Record<Continent, string> = {')
    for cont, d in out.items(): print(f"  '{cont}': '{d}',")
    print('}')

main(sys.argv[1])
