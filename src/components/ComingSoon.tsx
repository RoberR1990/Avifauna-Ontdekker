import { useT } from '../i18n'

/** Tijdelijke inhoud van feature-pagina's tot de feature is gebouwd. */
export function ComingSoon({ title }: { title: string }) {
  const t = useT()
  return (
    <>
      <h1>{title}</h1>
      <section className="card c-s">
        <h2>{t('soon.title')}</h2>
        <p>{t('soon.text')}</p>
      </section>
    </>
  )
}
