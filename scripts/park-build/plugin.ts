// Vite-plugin: serveert (dev) en emit (build) het parkpakket onder <base>park/*.
import { createReadStream, statSync } from 'node:fs'
import { extname } from 'node:path'
import type { Plugin } from 'vite'
import type { Lang } from '../../src/data/types.ts'
import { buildBundle, defaultBuildCacheDirs, type BuildResult } from './index.ts'
import { defaultMediumDir, ensureMediums } from './medium.ts'
import { readFileSync } from 'node:fs'

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.opus': 'audio/ogg; codecs=opus',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
}

/** Zelfde waarde als `sizes` van de kopfoto op de soortpagina (SpeciesPage). */
const SPECIES_SIZES = '(min-width: 640px) 600px, 100vw'

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
  const mediumDir = defaultMediumDir()
  const get = (lang: Lang) => {
    let r = cache.get(lang)
    if (!r) {
      r = buildBundle(parkDir, lang, { mediumDir })
      cache.set(lang, r)
    }
    return r
  }

  return {
    name: 'avifauna-park-data',
    async buildStart() {
      await ensureMediums(parkDir, mediumDir)
      cache = new Map()
    },
    configResolved(config) {
      base = config.base
    },
    // Bundel zo vroeg mogelijk laden (LCP): preload in de taal uit de instellingen, anders de standaardtaal.
    transformIndexHtml(_html, ctx) {
      const fallback = JSON.stringify(options.defaultLanguage ?? langs[0])
      const allowed = JSON.stringify(langs)
      const code =
        `(function(){var l=${fallback};try{var s=JSON.parse(localStorage.getItem('ao-settings')||'{}');` +
        `if(${allowed}.indexOf(s.lang)>=0)l=s.lang}catch(e){}var k=document.createElement('link');` +
        `k.rel='preload';k.as='fetch';k.crossOrigin='anonymous';k.href=${JSON.stringify(base)}+'park/data.'+l+'.json';` +
        `document.head.appendChild(k)})()`
      // Soortpagina: foto (vaste naamgeving van de pipeline) direct mee laden. Pas na de viewport-meta
      // injecteren: `imagesizes` met vw rekent anders met de 980px-standaardviewport en kiest de grootste.
      const imgCode =
        `(function(){var m=(location.pathname.split('/soort/')[1]||'').replace(/[/]$/,'');if(/^[a-z-]+$/.test(m)){var i=document.createElement('link');` +
        `i.rel='preload';i.as='image';i.setAttribute('fetchpriority','high');` +
        `var p=${JSON.stringify(base)}+'park/media/photos/'+m;` +
        `i.href=p+'-800.webp';i.setAttribute('imagesrcset',p+'-thumb.webp 400w,'+p+'-800.webp 800w,'+p+'.webp 1200w');` +
        `i.setAttribute('imagesizes',${JSON.stringify(SPECIES_SIZES)});document.head.appendChild(i)}})()`
      // Atlas: de lazy chunk (en css) meteen ophalen i.p.v. pas na het starten van de hoofd-JS (verkort de LCP-keten).
      const atlas = Object.values(ctx.bundle ?? {}).find((b) => b.type === 'chunk' && b.name === 'AtlasPage')
      const atlasFiles =
        atlas && atlas.type === 'chunk'
          ? [
              { href: base + atlas.fileName, rel: 'modulepreload' },
              ...[...(atlas.viteMetadata?.importedCss ?? [])].map((f) => ({ href: base + f, rel: 'preload', as: 'style' })),
            ]
          : []
      const atlasCode =
        atlasFiles.length > 0
          ? `(function(){if(location.pathname.replace(/[/]$/,'')!==${JSON.stringify(base.replace(/\/$/, '') + '/atlas')})return;` +
            `${JSON.stringify(atlasFiles)}.forEach(function(f){var k=document.createElement('link');for(var a in f)k.setAttribute(a,f[a]);document.head.appendChild(k)})})()`
          : null
      return [
        ...(atlasCode ? [{ tag: 'script' as const, children: atlasCode, injectTo: 'head-prepend' as const }] : []),
        { tag: 'script', children: code, injectTo: 'head-prepend' },
        { tag: 'script', children: imgCode, injectTo: 'head' },
      ]
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
        const { bundle, files, warnings } = buildBundle(parkDir, lang, { mediumDir })
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
