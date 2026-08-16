import React from 'react'
import Spinner from 'components/Spinner/Spinner'
import type { AcquisitionSource } from 'shared/types'
import styles from './YouTubePreview.css'

interface YouTubePreviewProps {
  source: AcquisitionSource
  resultId: string
  videoId: string | null
  isLoading: boolean
  error: string | null
}

/**
 * Lets the user watch the actual YouTube video on their OWN screen (this
 * modal) before committing to a download — the room's shared Player is never
 * involved here.
 *
 * Deliberately NOT the YouTube IFrame Player API: many "professional"
 * karaoke uploads (Sing King etc.) disable embedding on other websites, which
 * the IFrame API respects and shows as "Video unavailable" for — confirmed
 * live 2026-08-13 previewing "La Bikina". Instead, mirrors PiKaraoke's
 * approach: the server resolves a direct progressive stream URL via yt-dlp
 * (same mechanism the real download uses).
 *
 * Playback points at our own `/api/acquisition/preview-stream` proxy (see
 * server/Acquisition/router.ts) rather than a resolved googlevideo.com URL
 * directly: those signed URLs are IP-locked and occasionally get rejected
 * outright by Google regardless of who asks — confirmed live 2026-08-14,
 * back-to-back resolutions of the same "La Bikina" video got a 403 one
 * moment and a 200 the next. The proxy resolves fresh (server-side, so
 * Google only ever sees this server's IP) and retries with a brand-new URL
 * on failure, which is much more reliable than reusing one URL that already
 * failed once.
 */
const YouTubePreview = ({ source, resultId, videoId, isLoading, error }: YouTubePreviewProps) => {
  const [playbackError, setPlaybackError] = React.useState(false)
  const [retryCount, setRetryCount] = React.useState(0)

  const proxiedSrc = `${document.baseURI}api/acquisition/preview-stream`
    + `?source=${encodeURIComponent(source)}&resultId=${encodeURIComponent(resultId)}&retry=${retryCount}`

  const handleRetry = () => {
    setPlaybackError(false)
    setRetryCount(n => n + 1)
  }

  return (
    <div className={styles.player}>
      {isLoading && <Spinner />}
      {error && <p className={styles.error}>{error}</p>}

      {playbackError && !isLoading && !error && (
        <div className={styles.embedError}>
          <p>This video could not be previewed here.</p>
          <button type='button' className={styles.retryButton} onClick={handleRetry}>Try again</button>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target='_blank'
            rel='noreferrer'
            className={styles.watchLink}
          >
            Watch on YouTube ↗
          </a>
        </div>
      )}

      {!isLoading && !error && !playbackError && (
        <video
          key={proxiedSrc}
          className={styles.video}
          src={proxiedSrc}
          controls
          autoPlay
          playsInline
          onError={() => setPlaybackError(true)}
        />
      )}
    </div>
  )
}

export default YouTubePreview
