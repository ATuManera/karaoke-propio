import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Modal from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Spinner from 'components/Spinner/Spinner'
import PitchModal from 'components/PitchModal/PitchModal'
import YouTubePreview from './YouTubePreview'
import PlaylistImport from './PlaylistImport'
import { searchAcquisition, importPlaylist, previewAcquisition, clearPreview, acquireResult } from 'routes/Library/modules/acquisition'
import { setFilterStr } from 'routes/Library/modules/library'
import { formatDuration } from 'lib/dateTime'
import { guessArtistTitle } from 'shared/acquisitionMeta'
import { parsePlaylistId } from 'shared/youtubePlaylist'
import type { PlaylistTrackMeta } from 'shared/playlistMatch'
import type { AcquisitionSearchResult, AcquisitionSource, PlaylistImportEntry } from 'shared/types'
import styles from './AcquisitionModal.css'

interface AcquisitionModalProps {
  initialQuery: string
  /** 'playlist' reopens the last imported playlist instead of searching for initialQuery */
  initialView?: 'search' | 'playlist'
  onClose(): void
}

// compact enough to sit in a list row without wrapping ("4.2M", "264K")
function formatViewCount (n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/**
 * Step 2 of song acquisition (step 1 is the existing local library search
 * finding nothing — see SearchResults). Search here NEVER adds anything by
 * itself; picking a result first opens a preview (YouTube embed, played on
 * the user's OWN screen — never the room's shared Player) so a bad/wrong
 * version can be rejected before it's downloaded. Only "Add to queue" from
 * the preview opens the PitchModal used for local songs, so pitch is always
 * chosen at add-time (see prompt_de_implementacion.md #27), then kicks off
 * the async download/publish/register/queue pipeline.
 *
 * USDB requires the operator to have configured USDB_USERNAME/USDB_PASSWORD
 * server-side (see server/Acquisition/UsdbClient.ts) — without it, searching
 * that source surfaces a clear error rather than silently returning nothing.
 *
 * The same box takes a link to a public YouTube playlist, which switches this
 * to the import list (see PlaylistImport). Deliberately not a separate screen
 * or a fourth button: it is the same errand — getting a song into the library —
 * and each song the playlist turns out to be missing comes straight back here
 * as an ordinary search, preview and pitch.
 */
const AcquisitionModal = ({ initialQuery, initialView = 'search', onClose }: AcquisitionModalProps) => {
  const dispatch = useAppDispatch()
  const {
    isSearching, searchError, results, resultsQuery, resultsSource,
    isPlaylistLoading, playlistError, playlist,
    isPreviewLoading, previewError, previewVideoId,
    activeRequest, addError,
  } = useAppSelector(state => state.acquisition)
  const [query, setQuery] = useState(initialQuery)
  const [source, setSource] = useState<AcquisitionSource>('youtube')
  // the same modal answers two questions — "find me this song" and "what of my
  // playlist is already here" — because they are the same errand, and pasting a
  // link is how people say which one they mean
  const [isPlaylistView, setPlaylistView] = useState(initialView === 'playlist')
  // on by default: a plain music video can't be sung to, so surfacing them
  // unasked just makes the user wade through unusable results
  const [karaokeOnly, setKaraokeOnly] = useState(true)
  const [previewingResult, setPreviewingResult] = useState<AcquisitionSearchResult | null>(null)
  // where the preview came from: it decides whether backing out returns to a
  // list of search results or to the playlist, and what the acquisition records
  // as the query that found it
  const [previewOrigin, setPreviewOrigin] = useState<{ from: 'search' | 'playlist', query: string }>({ from: 'search', query: '' })
  // pre-filled from the YouTube title, but always the user's to correct: the
  // "Artist - Title" order is a convention uploaders break constantly, and a
  // wrong guess files the song under a bogus artist
  const [meta, setMeta] = useState({ artist: '', title: '' })
  const [pickedResult, setPickedResult] = useState<AcquisitionSearchResult | null>(null)

  useEffect(() => {
    if (initialView === 'playlist') return

    const q = initialQuery.trim()
    if (!q) return

    // The library's own search box is where a link gets pasted in practice: it
    // filters as you type, finds nothing, and offers this modal. So the paste
    // has to be recognised here too, or the likeliest path into the feature
    // runs a YouTube text search for a URL.
    const playlistId = parsePlaylistId(q)

    if (playlistId) {
      setPlaylistView(true)
      if (playlist?.playlistId !== playlistId) dispatch(importPlaylist(q))
      return
    }

    // results survive this modal being closed (they live in the store), so
    // reopening for the same query reuses them rather than making the user
    // sit through an identical YouTube search again
    if (results.length && resultsQuery === q && resultsSource === 'youtube') return

    dispatch(searchAcquisition(q, 'youtube'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    if (parsePlaylistId(q)) {
      dispatch(importPlaylist(q))
      setPlaylistView(true)
      return
    }

    dispatch(searchAcquisition(q, source, karaokeOnly))
    setPlaylistView(false)
  }

  // one song from the playlist that the library doesn't have: hand it to the
  // ordinary search, which still previews and still asks for a pitch — nothing
  // is downloaded on the strength of a playlist entry alone
  const handleFind = (track: PlaylistTrackMeta, entryTitle: string) => {
    const q = (track.artist ? `${track.artist} ${track.title}` : track.title || entryTitle).trim()

    setQuery(q)
    setSource('youtube')
    dispatch(searchAcquisition(q, 'youtube', karaokeOnly))
    setPlaylistView(false)
  }

  // an entry that is already a karaoke track: the version its owner chose, so
  // offer that very video rather than searching for a different one. Same
  // preview and same pitch question as any other acquisition — the guessed
  // artist and title arrive in the fields, which is where a karaoke channel's
  // running-words title gets corrected before anything is filed under it
  const handleGet = (entry: PlaylistImportEntry, track: PlaylistTrackMeta) => {
    const label = (track.artist ? `${track.artist} ${track.title}` : track.title).trim() || entry.title

    setSource('youtube')
    setPreviewingResult({
      id: entry.id,
      title: entry.title,
      uploader: entry.uploader,
      thumbnail: entry.thumbnail,
      durationSeconds: entry.durationSeconds,
    })
    setMeta({ artist: track.artist, title: track.title })
    setPreviewOrigin({ from: 'playlist', query: label })
    dispatch(previewAcquisition('youtube', entry.id))
  }

  // one it already has: the library row is where queueing, pitch and versions
  // live, so go there rather than growing a second way to do all three
  const handleOpenSong = (libraryTitle: string) => {
    dispatch(setFilterStr(libraryTitle))
    onClose()
  }

  const handleSourceChange = (next: AcquisitionSource) => {
    setSource(next)
    if (query.trim()) dispatch(searchAcquisition(query.trim(), next, karaokeOnly))
  }

  const handleKaraokeOnlyChange = (next: boolean) => {
    setKaraokeOnly(next)
    // re-run immediately: the toggle changes the result set, so making the
    // user press Search again would just look broken
    if (query.trim()) dispatch(searchAcquisition(query.trim(), source, next))
  }

  const handlePick = (result: AcquisitionSearchResult) => {
    setPreviewingResult(result)
    setPreviewOrigin({ from: 'search', query })
    // USDB already carries authoritative artist/title; only YouTube needs a guess
    setMeta(result.artist
      ? { artist: result.artist, title: result.title }
      : guessArtistTitle(result.title))
    dispatch(previewAcquisition(source, result.id))
  }

  const handleSwapMeta = () => setMeta(m => ({ artist: m.title, title: m.artist }))

  const handlePreviewBack = () => {
    setPreviewingResult(null)
    dispatch(clearPreview())
  }

  const handlePreviewAdd = () => {
    if (!previewingResult) return
    setPickedResult(previewingResult)
    setPreviewingResult(null)
  }

  const handlePitchClose = () => setPickedResult(null)

  const handlePitchConfirm = (pitchSemitones: number) => {
    if (!pickedResult) return
    dispatch(acquireResult(
      source, pickedResult.id, pickedResult.title, pitchSemitones, previewOrigin.query || query,
      meta.artist.trim() || undefined,
      meta.title.trim() || undefined,
      pickedResult.viewCount ?? null,
    ))
    setPickedResult(null)
  }

  // once a request is queued (or failed), let the user see the outcome and
  // close manually — do not auto-close, so errors aren't missed
  const isAcquiring = activeRequest && activeRequest.state !== 'queued' && activeRequest.state !== 'error'
  // a pasted link is not a search, and the button should not claim it is
  const isPlaylistQuery = !!parsePlaylistId(query)

  return (
    <>
      <Modal
        className={styles.modal}
        // while previewing, every "close" affordance (X, Escape, clicking
        // outside) steps BACK to the results instead of tearing down the
        // modal: closing outright would throw away a search the user already
        // waited on, forcing them to run it again just to try another version
        onClose={previewingResult ? handlePreviewBack : onClose}
        title={previewingResult ? 'Preview' : isPlaylistView ? 'Your playlist' : 'Search for a song'}
        scrollable
        // preview's Choose another/Add to queue live in Modal's fixed
        // footer (buttons prop), NOT in the scrollable content area — a
        // tall/failed video embed must never be able to push them out of
        // view, or the only visible way out becomes the X (closes
        // everything, loses the search results)
        buttons={previewingResult
          ? (
              <>
                <Button onClick={handlePreviewBack}>
                  {previewOrigin.from === 'playlist' ? 'Back to playlist' : 'Choose another'}
                </Button>
                <Button
                  variant='primary'
                  onClick={handlePreviewAdd}
                  disabled={!previewVideoId || isPreviewLoading || !!previewError || !meta.artist.trim() || !meta.title.trim()}
                >
                  Add to queue
                </Button>
              </>
            )
          : undefined}
      >
        {previewingResult
          ? (
              <>
                <p className={styles.previewTitle} translate='no'>{previewingResult.title}</p>
                <YouTubePreview
                  // remount (not update) when the video changes, so
                  // playbackError's local state resets automatically instead
                  // of needing an explicit reset inside an effect
                  key={previewingResult.id}
                  source={source}
                  resultId={previewingResult.id}
                  videoId={previewVideoId}
                  isLoading={isPreviewLoading}
                  error={previewError}
                />

                {/* Confirmed before downloading, because these decide which
                    artist the song files under — and YouTube titles are not a
                    reliable source (see shared/acquisitionMeta.ts) */}
                <div className={styles.metaFields}>
                  <label className={styles.metaLabel}>
                    Artist
                    <input
                      type='text'
                      className={styles.metaInput}
                      value={meta.artist}
                      onChange={e => setMeta(m => ({ ...m, artist: e.target.value }))}
                      placeholder='e.g. The Beatles'
                    />
                  </label>
                  <label className={styles.metaLabel}>
                    Title
                    <input
                      type='text'
                      className={styles.metaInput}
                      value={meta.title}
                      onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
                      placeholder='e.g. Here Comes The Sun'
                    />
                  </label>
                  <button type='button' className={styles.swapButton} onClick={handleSwapMeta}>
                    ⇅ Swap artist and title
                  </button>
                </div>
              </>
            )
          : (
              <>
                {!isPlaylistView && (
                  <div className={styles.sourceTabs} role='tablist' aria-label='Source'>
                    <Button
                      variant={source === 'youtube' ? 'primary' : 'default'}
                      onClick={() => handleSourceChange('youtube')}
                      role='tab'
                      aria-selected={source === 'youtube'}
                    >
                      YouTube
                    </Button>
                    <Button
                      variant={source === 'usdb' ? 'primary' : 'default'}
                      onClick={() => handleSourceChange('usdb')}
                      role='tab'
                      aria-selected={source === 'usdb'}
                    >
                      UltraStar (USDB)
                    </Button>
                  </div>
                )}

                <form className={styles.searchForm} onSubmit={handleSearch}>
                  <input
                    type='search'
                    className={styles.searchInput}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder='Artist, song title or playlist link'
                    autoFocus
                  />
                  <Button variant='primary' type='submit' disabled={!query.trim()}>
                    {isPlaylistQuery ? 'Open' : 'Search'}
                  </Button>
                </form>

                {/* USDB only ever holds karaoke tracks, so the filter is meaningless there */}
                {!isPlaylistView && source === 'youtube' && (
                  <InputCheckbox
                    className={styles.karaokeOnly}
                    label='Karaoke versions only'
                    checked={karaokeOnly}
                    onChange={e => handleKaraokeOnlyChange(e.target.checked)}
                  />
                )}

                {/* the entry point is a paste, so it has to be said somewhere */}
                {!isPlaylistView && !playlist && (
                  <p className={styles.hint}>
                    Have a playlist? Paste its link — public or unlisted — to see which of its songs are already here.
                  </p>
                )}

                {!isPlaylistView && playlist && (
                  <Button className={styles.backToPlaylist} onClick={() => setPlaylistView(true)}>
                    ← Back to your playlist
                  </Button>
                )}

                {activeRequest && (
                  <div className={clsx(styles.status, activeRequest.state === 'error' && styles.danger)}>
                    {activeRequest.state === 'downloading' && 'Downloading…'}
                    {activeRequest.state === 'processing' && 'Processing (generating CD+G)…'}
                    {activeRequest.state === 'publishing' && 'Publishing…'}
                    {activeRequest.state === 'registering' && 'Registering in library…'}
                    {activeRequest.state === 'queued' && `Added to queue: ${activeRequest.result?.title}`}
                    {activeRequest.state === 'error' && `Error: ${activeRequest.error}`}
                  </div>
                )}

                {addError && <div className={clsx(styles.status, styles.danger)}>{addError}</div>}

                {isPlaylistView
                  ? (
                      <>
                        {isPlaylistLoading && <Spinner />}

                        {playlistError && <div className={clsx(styles.status, styles.danger)}>{playlistError}</div>}

                        {!isPlaylistLoading && playlist && (
                          <PlaylistImport
                            playlist={playlist}
                            onFind={handleFind}
                            onGet={handleGet}
                            onOpen={handleOpenSong}
                          />
                        )}
                      </>
                    )
                  : (
                      <>
                        {isSearching && <Spinner />}

                        {searchError && <div className={clsx(styles.status, styles.danger)}>{searchError}</div>}

                        {!isSearching && !searchError && results.length === 0 && (
                          <p className={styles.empty}>No results yet — try a search above.</p>
                        )}

                        <ul className={styles.results}>
                          {results.map(result => (
                            <li key={result.id}>
                              <button
                                type='button'
                                className={styles.resultItem}
                                onClick={() => handlePick(result)}
                                disabled={!!isAcquiring}
                              >
                                {result.thumbnail && <img src={result.thumbnail} alt='' className={styles.thumbnail} />}
                                <div className={styles.resultInfo}>
                                  <div className={styles.resultTitle} translate='no'>{result.title}</div>
                                  {result.artist && <div className={styles.resultUploader} translate='no'>{result.artist}</div>}
                                  {result.uploader && (
                                    <div className={styles.resultUploader}>
                                      <span translate='no'>{result.uploader}</span>
                                      {result.isVerified && (
                                        <span className={styles.verified} title='Verified channel' aria-label='Verified channel'>✓</span>
                                      )}
                                    </div>
                                  )}
                                  {typeof result.viewCount === 'number' && (
                                    <div className={styles.resultViews}>
                                      {formatViewCount(result.viewCount)}
                                      {' '}
                                      views
                                    </div>
                                  )}
                                </div>
                                {typeof result.durationSeconds === 'number' && (
                                  <div className={styles.resultDuration}>{formatDuration(result.durationSeconds)}</div>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
              </>
            )}
      </Modal>

      {pickedResult && (
        <PitchModal
          title='Choose pitch'
          songTitle={pickedResult.title}
          onConfirm={handlePitchConfirm}
          onClose={handlePitchClose}
        />
      )}
    </>
  )
}

export default AcquisitionModal
