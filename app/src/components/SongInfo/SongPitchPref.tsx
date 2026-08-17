import React from 'react'
import { ensureState } from 'redux-optimistic-ui'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { clearSongPitchPref } from 'store/modules/userPitchPrefs'
import { formatPitch } from 'shared/pitch'
import styles from './SongInfo.css'

/**
 * The pitch the person reading this panel sings this song in — theirs alone,
 * not the song's. Someone else opening the same panel sees their own number,
 * or none.
 */
const SongPitchPref = ({ songId }: { songId: number }) => {
  const dispatch = useAppDispatch()
  const pref = useAppSelector(state => ensureState(state.userPitchPrefs)[songId])

  const handleForget = () => dispatch(clearSongPitchPref(songId))

  return (
    <p>
      <span className={styles.label}>My pitch: </span>
      {pref
        ? (
            <>
              {formatPitch(pref.pitchSemitones)}
              {pref.source === 'inferred' && <span className={styles.confidence}> (last sung)</span>}
              &nbsp;
              <a onClick={handleForget}>(Forget)</a>
            </>
          )
        : 'not saved'}
    </p>
  )
}

export default SongPitchPref
