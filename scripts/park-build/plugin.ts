// Vite-plugin: serveert (dev) en emit (build) het parkpakket onder <base>park/*.
import { createReadStream, statSync } from 'node:fs'
import { extname } from 'node:path'
import type { Plugin } from 'vite'
import type { Lang } from '../../src/data/types.ts'
import { buildBundle, defaultBuildCacheDirs, type BuildResult } from './index.ts'
import { readFileSync } from 'node:fs'

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.opus': 'audio/ogg; codecs=opus',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
}

export interface ParkDataOptions {
  parkDir: string
  languages?: Lang[]
  /** Taal waarvan de bundel vooraf geladen wordt als de gebruiker nog niets koos. */
  defaultLanguage?: string
}

export function parkData(options: ParkDataOptions): Plugin {
  const { parkDir } = options
  const langs: Lang[] = options.languages ?? ['nl', 'en']
  let base = '/'
  let cache = new Map<Lang, BuildResult>()
  const get = (lang: Lang) => {
    let r = cache.get(lang)
    if (!r) {
      r = buildBundle(parkDir, lang)
      cache.set(lang, r)
    }
    return r
  }

  return {
    name: 'avifauna-park-data',
    configResolved(config) {
      base = config.base
    },
    // Bundel zo vroeg mogelijk laden (LCP): preload in de taal uit de instellingen, anders de standaardtaal.
    transformIndexHtml() {
      const fallback = JSON.stringify(options.defaultLanguage ?? langs[0])
      const allowed = JSON.stringify(langs)
      const code =
        `(function(){var l=${fallback};try{var s=JSON.parse(localStorage.getItem('ao-settings')||'{}');` +
        `if(${allowed}.indexOf(s.lang)>=0)l=s.lang}catch(e){}var k=document.createElement('link');` +
        `k.rel='preload';k.as='fetch';k.crossOrigin='anonymous';k.href=${JSON.stringify(base)}+'park/data.'+l+'.json';` +
        `document.head.appendChild(k);` +
        // Soortpagina: grote foto (vaste naamgeving van de pipeline) direct mee laden.
        `var m=(location.pathname.split('/soort/')[1]||'').replace(/[/]$/,'');if(/^[a-z-]+$/.test(m)){var i=document.createElement('link');` +
        `i.rel='preload';i.as='image';i.setAttribute('fetchpriority','high');` +
        `i.href=${JSON.stringify(base)}+'park/media/photos/'+m+'.webp';document.head.appendChild(i)}})()`
      return [{ tag: 'script', children: code, injectTo: 'head-prepend' }]
    },
    configureServer(server) {
      server.watcher.add([parkDir, ...defaultBuildCacheDirs()])
      server.watcher.on('all', () => {
        cache = new Map()
      })
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const prefix = `${base}park/`
        const alt = '/park/'
        const rel = url.startsWith(prefix) ? url.slice(prefix.length) : url.startsWith(alt) ? url.slice(alt.length) : null
        if (rel == null) return next()
        try {
          const m = /^data\.([a-z]{2})\.json$/.exec(rel)
          if (m) {
            res.setHeader('Content-Type', MIME['.json'])
            res.setHeader('Cache-Control', 'no-store')
            res.end(JSON.stringify(get(m[1] as Lang).bundle))
            return
          }
          for (const l of langs) {
            const f = get(l).files.find((x) => x.to === `park/${decodeURIComponent(rel)}`)
            if (f) {
              res.setHeader('Content-Type', MIME[extname(f.to)] ?? 'application/octet-stream')
              res.setHeader('Content-Length', statSync(f.from).size)
              createReadStream(f.from).pipe(res)
              return
            }
          }
          res.statusCode = 404
          res.end('Not found')
        } catch (e) {
          next(e as Error)
        }
      })
    },
    generateBundle() {
      const emitted = new Set<string>()
      for (const lang of langs) {
        const { bundle, files, warnings } = buildBundle(parkDir, lang)
        for (const w of warnings) this.warn(w)
        this.emitFile({ type: 'asset', fileName: `park/data.${lang}.json`, source: JSON.stringify(bundle) })
        for (const f of files) {
          if (emitted.has(f.to)) continue
          emitted.add(f.to)
          this.emitFile({ type: 'asset', fileName: f.to, source: readFileSync(f.from) })
        }
      }
    },
  }
}
