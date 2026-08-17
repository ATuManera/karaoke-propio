import React from 'react'
import { ensureState } from 'redux-optimistic-ui'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import { clearSongPitchPref, setSongPitchPref } from 'store/modules/userPitchPrefs'
import { queueSong } from 'routes/Queue/modules/queue'
import getSongsStatus from 'routes/Library/selectors/getSongsStatus'
import { formatPitch, PITCH_MAX, PITCH_MIN } from 'shared/pitch'
import styles from './MyPitches.css'

/**
 * Every pitch this singer has saved, in one place to review, correct and sing.
 *
 * In practice this becomes their repertoire: the songs they know they can sing,
 * each already at the right pitch. So it queues directly — going back to the
 * library to search for a song that is already listed here, only to re-answer
 * a question already answered, would be the long way round.
 *
 * Only their own, and only ever their own: the same song sits at a different
 * pitch for every voice, so there is nothing here to compare against anyone
 * else (see migration 012).
 */
const MyPitches = () => {
  const dispatch = useAppDispatch()
  const prefs = useAppSelector(state => ensureState(state.userPitchPrefs))
  const songs = useAppSelector(state => state.songs.entities)
  const artists = useAppSelector(state => state.artists.entities)
  const roomId = useAppSelector(state => state.user.roomId)
  const { upcoming, current } = useAppSelector(getSongsStatus)

  const rows = Object.keys(prefs)
    .map(Number)
    // a song can be deleted from the library while the client's copy still
    // lags behind; skip rather than render a blank row
    .filter(songId => songs[songId])
    .map(songId => ({
      songId,
      title: songs[songId].title,
      artist: artists[songs[songId].artistId]?.name ?? '',
      pref: prefs[songId],
      isQueued: upcoming.includes(songId) || current === songId,
    }))
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title))

  const handleNudge = (songId: number, pitchSemitones: number, by: number) => {
    const next = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitchSemitones + by))
    // nudging here is a deliberate correction, so it is saved as one and stops
    // being merely observed
    if (next !== pitchSemitones) dispatch(setSongPitchPref(songId, next))
  }

  // the saved mediaId is the recording the pitch was worked out against, so
  // queueing that exact one keeps the number meaning what it meant
  const handleQueue = (songId: number) => {
    dispatch(queueSong(songId, prefs[songId].pitchSemitones, prefs[songId].mediaId ?? undefined))
  }

  const handleForget = (songId: number) => dispatch(clearSongPitchPref(songId))

  return (
    <Panel title='My Pitches' contentClassName={styles.content}>
      <>
        {rows.length === 0 && (
          <p className={styles.empty}>
            Nothing saved yet. Tick
            {' '}
            <em>Remember this pitch for me</em>
            {' '}
            when you add a song, and it will be waiting for you next time.
          </p>
        )}

        {rows.length > 0 && (
          <p className={styles.hint}>
            Your songs, each at the pitch that suits your voice. Use
            {' '}
            <strong>−</strong>
            {' '}
            and
            {' '}
            <strong>+</strong>
            {' '}
            to correct one whenever you find a better fit.
          </p>
        )}

        {rows.map(({ songId, title, artist, pref, isQueued }) => (
          <div key={songId} className={styles.row}>
            <div className={styles.song}>
              <div className={styles.title} translate='no'>{title}</div>
              <div className={styles.artist} translate='no'>{artist}</div>
              {pref.source === 'inferred' && (
                <div className={styles.inferredNote}>last sung at this pitch</div>
              )}
            </div>

            <div className={styles.controls}>
              <Button
                className={styles.nudge}
                onClick={() => handleNudge(songId, pref.pitchSemitones, -1)}
                disabled={pref.pitchSemitones <= PITCH_MIN}
                aria-label={`Lower my pitch for ${title}`}
              >
                −
              </Button>
              <output className={styles.pitch}>{formatPitch(pref.pitchSemitones)}</output>
              <Button
                className={styles.nudge}
                onClick={() => handleNudge(songId, pref.pitchSemitones, 1)}
                disabled={pref.pitchSemitones >= PITCH_MAX}
                aria-label={`Raise my pitch for ${title}`}
              >
                +
              </Button>

              {/* Account is reachable without being in a room (see Routes),
                  and queueing needs one. Disabled with the reason showing,
                  rather than failing at the server after the tap. */}
              <Button
                variant='primary'
                className={styles.queue}
                onClick={() => handleQueue(songId)}
                disabled={roomId === null || isQueued}
                title={roomId === null ? 'Join a room to add songs' : undefined}
              >
                {isQueued ? 'Queued' : 'Sing it'}
              </Button>

              <a
                className={styles.forget}
                onClick={() => handleForget(songId)}
                aria-label={`Forget my pitch for ${title}`}
              >
                Forget
              </a>
            </div>
          </div>
        ))}

        {rows.length > 0 && roomId === null && (
          <p className={styles.hint}>Join a room to add any of these to the queue.</p>
        )}
      </>
    </Panel>
  )
}

export default MyPitches
