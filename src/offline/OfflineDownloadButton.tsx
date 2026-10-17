import { makeT } from '../i18n'
import { useOfflineStatus } from './prefetch'

const useT = makeT({
  nl: {
    download: 'Download alles voor offline',
    downloading: 'Bezig met downloaden…',
    complete: 'Alles offline beschikbaar',
    partial: 'Deels offline beschikbaar',
    retry: 'Opnieuw proberen',
    unsupported: 'Offline opslaan wordt niet ondersteund op dit toestel',
    mb: 'MB',
  },
  en: {
    download: 'Download everything for offline',
    downloading: 'Downloading…',
    complete: 'Everything available offline',
    partial: 'Partly available offline',
    retry: 'Try again',
    unsupported: 'Offline storage is not supported on this device',
    mb: 'MB',
  },
})

const mb = (n: number) => (n / 1e6).toFixed(n >= 1e7 ? 0 : 1)

export function OfflineDownloadButton({ onStart }: { onStart?: () => void }) {
  const t = useT()
  const s = useOfflineStatus()

  if (s.phase === 'unsupported') return <p className="note">{t('unsupported')}</p>
  if (s.total === 0) return null

  if (s.phase === 'complete') {
    return (
      <p className="offline-ok" role="status" data-testid="offline-complete">
        <span aria-hidden="true">✓</span> {t('complete')}
      </p>
    )
  }

  const busy = s.phase === 'downloading'
  return (
    <div className="offline-download" data-testid="offline-download">
      <button
        type="button"
        className="btn btn--teal"
        disabled={busy}
        onClick={() => {
          onStart?.()
          void s.download()
        }}
      >
        {busy ? t('downloading') : s.phase === 'error' ? t('retry') : t('download')}
      </button>
      {(busy || s.phase === 'partial') && s.bytesTotal > 0 && (
        <>
          <progress max={s.bytesTotal} value={s.bytesDone} aria-label={t('downloading')} />
          <p className="note">
            {mb(s.bytesDone)} / {mb(s.bytesTotal)} {t('mb')}
          </p>
        </>
      )}
    </div>
  )
}
