import React, { useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { ensureState } from 'redux-optimistic-ui'
import SongItem from '../SongItem/SongItem'
import PitchModal from 'components/PitchModal/PitchModal'
import VersionModal from 'components/VersionModal/VersionModal'
import { queueSong } from 'routes/Queue/modules/queue'
import { showSongInfo } from 'store/modules/songInfo'
import { setSongPitchPref, clearSongPitchPref } from 'store/modules/userPitchPrefs'
import { toggleSongStarred } from 'store/modules/userStars'
import getSongsStatus from '../../selectors/getSongsStatus'
import { useT } from 'lib/i18n'

interface SongListProps {
  filterKeywords?: string[]
  showArtist: boolean
  songIds: number[]
}

const SongList = (props: SongListProps) => {
  const t = useT()
  const dispatch = useAppDispatch()
  const artists = useAppSelector(state => state.artists.entities)
  const songs = useAppSelector(state => state.songs.entities)
  const starredSongs = useAppSelector(state => ensureState(state.userStars).starredSongs)
  const pitchPrefs = useAppSelector(state => ensureState(state.userPitchPrefs))
  const starredSongCounts = useAppSelector(state => state.starCounts.songs)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const { played, upcoming, current } = useAppSelector(getSongsStatus)

  // pitch is chosen at the moment a song is queued (see PitchModal); track
  // which song (if any) is awaiting that choice
  const [pitchModalSongId, setPitchModalSongId] = useState<number | null>(null)
  // songs with several recordings ask which one first (see VersionModal); the
  // chosen mediaId rides along to the queue so playback uses that exact version
  const [versionModalSongId, setVersionModalSongId] = useState<number | null>(null)
  const [chosenMediaId, setChosenMediaId] = useState<number | null>(null)

  const handleSongQueue = (songId: number) => {
    setChosenMediaId(null)

    // only interrupt when there is a real choice to make
    if (songs[songId].numMedia > 1) setVersionModalSongId(songId)
    else setPitchModalSongId(songId)
  }

  const handleVersionConfirm = (mediaId: number) => {
    setChosenMediaId(mediaId)
    setPitchModalSongId(versionModalSongId)
    setVersionModalSongId(null)
  }

  const handleVersionClose = () => setVersionModalSongId(null)
  const handleSongInfo = (songId: number) => dispatch(showSongInfo(songId))
  const handleSongStar = (songId: number) => dispatch(toggleSongStarred(songId))

  const handlePitchConfirm = (pitchSemitones: number, remember?: boolean) => {
    const pref = pitchPrefs[pitchModalSongId]
    // the checkbox starts checked only for a pitch this singer decided on, so
    // unchecking it is the one gesture that means "forget it"
    const wasRemembered = !!pref && pref.source !== 'inferred'

    // saved before queueing, so the deliberate 'manual' write lands first and
    // the automatic 'inferred' one the queue makes cannot get there instead
    const isForgetting = !remember && wasRemembered

    if (remember) dispatch(setSongPitchPref(pitchModalSongId, pitchSemitones, chosenMediaId))
    else if (isForgetting) dispatch(clearSongPitchPref(pitchModalSongId))

    // when forgetting, this performance is not recorded either, so the badge
    // disappears outright instead of coming back dimmed
    dispatch(queueSong(pitchModalSongId, pitchSemitones, chosenMediaId ?? undefined, !isForgetting))
    setPitchModalSongId(null)
    setChosenMediaId(null)
  }

  const handlePitchClose = () => setPitchModalSongId(null)

  return (
    <>
      {props.songIds.map(songId => (
        <SongItem
          {...songs[songId]}
          artist={props.showArtist ? artists[songs[songId].artistId].name : ''}
          filterKeywords={props.filterKeywords}
          isPlayed={played.includes(songId)}
          isUpcoming={upcoming.includes(songId) || current === songId}
          isStarred={starredSongs.includes(songId)}
          isAdmin={isAdmin}
          key={songId}
          pitchPref={pitchPrefs[songId] ?? null}
          numStars={starredSongCounts[songId] || 0}
          onSongQueue={handleSongQueue}
          onSongStarClick={handleSongStar}
          onSongInfo={handleSongInfo}
        />
      ))}

      {versionModalSongId !== null && (
        <VersionModal
          songId={versionModalSongId}
          songTitle={songs[versionModalSongId].title}
          onConfirm={handleVersionConfirm}
          onClose={handleVersionClose}
        />
      )}

      {pitchModalSongId !== null && (
        <PitchModal
          title={t('library.choosePitch')}
          songTitle={songs[pitchModalSongId].title}
          savedPref={pitchPrefs[pitchModalSongId] ?? null}
          onConfirm={handlePitchConfirm}
          onClose={handlePitchClose}
        />
      )}
    </>
  )
}

export default SongList
