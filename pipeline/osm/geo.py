"""Projectie en affiene transformatie (pure functies, geen netwerk).

Projectie: lokale equirectangular met cos(lat0)-schaling, noord boven.
  X_m = (lon - lon0) * cos(lat0) * R * pi/180 ; Y_m = -(lat - lat0) * R * pi/180
  svg x = X_m * scale + pad_x ; svg y = Y_m * scale + pad_y
Omdat dit zelf al affien is in (lon, lat), volstaat voor de app één affiene
transformatie  x = a*lon + c*lat + e ; y = b*lon + d*lat + f.
"""
from __future__ import annotations

import math

R = 6371008.8


class Projection:
    def __init__(self, lat0: float, lon0: float, scale: float, ox: float = 0.0, oy: float = 0.0):
        self.lat0, self.lon0, self.scale, self.ox, self.oy = lat0, lon0, scale, ox, oy
        self.k = math.cos(math.radians(lat0))

    def to_xy(self, lat: float, lon: float) -> tuple[float, float]:
        mx = math.radians(lon - self.lon0) * self.k * R
        my = -math.radians(lat - self.lat0) * R
        return mx * self.scale + self.ox, my * self.scale + self.oy

    def to_latlon(self, x: float, y: float) -> tuple[float, float]:
        mx = (x - self.ox) / self.scale
        my = (y - self.oy) / self.scale
        return self.lat0 - math.degrees(my / R), self.lon0 + math.degrees(mx / (self.k * R))

    def affine(self) -> dict:
        """x = a*lon + c*lat + e ; y = b*lon + d*lat + f"""
        s = self.scale * math.radians(1) * R
        a = s * self.k
        d = -s
        e = -a * self.lon0 + self.ox
        f = -d * self.lat0 + self.oy
        return {"a": a, "b": 0.0, "c": 0.0, "d": d, "e": e, "f": f}


def apply_affine(t: dict, lat: float, lon: float) -> tuple[float, float]:
    return t["a"] * lon + t["c"] * lat + t["e"], t["b"] * lon + t["d"] * lat + t["f"]


def invert_affine(t: dict, x: float, y: float) -> tuple[float, float]:
    """Geeft (lat, lon)."""
    det = t["a"] * t["d"] - t["b"] * t["c"]
    dx, dy = x - t["e"], y - t["f"]
    lon = (t["d"] * dx - t["c"] * dy) / det
    lat = (-t["b"] * dx + t["a"] * dy) / det
    return lat, lon


def solve_affine(points: list[dict]) -> dict:
    """Los de affiene transformatie exact op uit 3 ijkpunten {lat,lon,x,y}."""
    (p1, p2, p3) = points
    # x = a*lon + c*lat + e
    def solve(v1, v2, v3):
        m = [[p1["lon"], p1["lat"], 1, v1], [p2["lon"], p2["lat"], 1, v2], [p3["lon"], p3["lat"], 1, v3]]
        for i in range(3):
            piv = max(range(i, 3), key=lambda r: abs(m[r][i]))
            m[i], m[piv] = m[piv], m[i]
            for r in range(3):
                if r != i:
                    fct = m[r][i] / m[i][i]
                    m[r] = [m[r][j] - fct * m[i][j] for j in range(4)]
        return [m[i][3] / m[i][i] for i in range(3)]
    a, c, e = solve(p1["x"], p2["x"], p3["x"])
    b, d, f = solve(p1["y"], p2["y"], p3["y"])
    return {"a": a, "b": b, "c": c, "d": d, "e": e, "f": f}
