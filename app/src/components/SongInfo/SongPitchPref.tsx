import React from 'react'
import { useT } from 'lib/i18n'
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
  const t = useT()
  const dispatch = useAppDispatch()
  const pref = useAppSelector(state => ensureState(state.userPitchPrefs)[songId])

  const handleForget = () => dispatch(clearSongPitchPref(songId))

  return (
    <p>
      <span className={styles.label}>{t('songInfo.myPitch')}</span>
      {' '}
      {pref
        ? (
            <>
              {formatPitch(pref.pitchSemitones)}
              {pref.source === 'inferred' && (
                <span className={styles.confidence}>
                  {' '}
                  {t('songInfo.pitchLastSung')}
                </span>
              )}
              &nbsp;
              <a onClick={handleForget}>{t('songInfo.pitchForget')}</a>
            </>
          )
        : t('songInfo.pitchNotSaved')}
    </p>
  )
}

export default SongPitchPref
