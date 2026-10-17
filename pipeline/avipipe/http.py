"""HTTP-client met cache, beleefd tempo en retries."""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

from .config import CACHE_DIR, USER_AGENT

log = logging.getLogger("avipipe")

# minimale tussentijd (s) per host
MIN_INTERVAL = {
    "query.wikidata.org": 1.5,
    "www.wikidata.org": 0.5,
    "commons.wikimedia.org": 0.3,
    "upload.wikimedia.org": 0.5,
    "xeno-canto.org": 1.0,
}


class Http:
    def __init__(self, cache_dir: Path | None = None, refresh: bool = False, session=None):
        self.cache_dir = Path(cache_dir) if cache_dir else CACHE_DIR
        self.refresh = refresh
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self._last: dict[str, float] = {}

    # -- intern
    def _key(self, method, url, params, data) -> str:
        raw = json.dumps([method, url, params, data], sort_keys=True, default=str)
        return hashlib.sha1(raw.encode()).hexdigest()

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        gap = MIN_INTERVAL.get(host, 0.5)
        wait = self._last.get(host, 0) + gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last[host] = time.monotonic()

    def _request(self, method, url, params=None, data=None, headers=None, retries=4) -> requests.Response:
        delay = 2.0
        last_exc = None
        for attempt in range(retries):
            self._throttle(url)
            try:
                r = self.session.request(method, url, params=params, data=data, headers=headers, timeout=90)
                if r.status_code in (429, 500, 502, 503, 504):
                    ra = r.headers.get("Retry-After")
                    wait = float(ra) if ra and ra.isdigit() else delay
                    log.warning("HTTP %s van %s, nieuwe poging over %.0fs", r.status_code, url, wait)
                    time.sleep(wait)
                    delay *= 2
                    last_exc = RuntimeError(f"HTTP {r.status_code}")
                    continue
                return r
            except requests.RequestException as e:
                last_exc = e
                log.warning("Netwerkfout %s (%s), nieuwe poging over %.0fs", url, re.sub(r"key=[^&\s]+", "key=***", str(e)), delay)
                time.sleep(delay)
                delay *= 2
        raise RuntimeError(f"Mislukt na {retries} pogingen: {url}: " + re.sub(r"key=[^&\s]+", "key=***", str(last_exc)))

    # -- publiek
    def get_json(self, url, params=None, data=None, method="GET", headers=None, ok_statuses=(200,)):
        """JSON met cache. Foutantwoorden (400) worden niet gecachet; 'ok_statuses' bepaalt wat geldig is."""
        key = self._key(method, url, params, data)
        path = self.cache_dir / f"{key}.json"
        if path.exists() and not self.refresh:
            return json.loads(path.read_text(encoding="utf-8"))
        r = self._request(method, url, params=params, data=data, headers=headers)
        if r.status_code not in ok_statuses:
            raise RuntimeError(f"HTTP {r.status_code} van {url}: {r.text[:200]}")
        obj = r.json()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        return obj

    def get_bytes(self, url, params=None) -> bytes:
        key = self._key("GET-bytes", url, params, None)
        path = self.cache_dir / f"{key}.bin"
        if path.exists() and not self.refresh:
            return path.read_bytes()
        r = self._request("GET", url, params=params)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} van {url}")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
        return r.content
