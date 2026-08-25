import React, { useState } from 'react'
import clsx from 'clsx'
import Highlighter from 'react-highlight-words'
import { useSwipeable } from 'react-swipeable'
import Button from 'components/Button/Button'
import ButtonStar from 'components/ButtonStar/ButtonStar'
import Buttons from 'components/Buttons/Buttons'
import Icon from 'components/Icon/Icon'
import ToggleAnimation from 'components/ToggleAnimation/ToggleAnimation'
import { formatDuration } from 'lib/dateTime'
import { formatPitch } from 'shared/pitch'
import type { SongPitchPref } from 'shared/types'
import styles from './SongItem.css'
import { useT } from 'lib/i18n'

let ignoreMouseup = false

interface SongItemProps {
  songId: number
  artist?: string
  title: string
  duration: number
  onSongQueue(songId: number): void
  onSongStarClick(songId: number): void
  onSongInfo(songId: number): void
  isPlayed: boolean
  isStarred: boolean
  isUpcoming: boolean
  isAdmin: boolean
  numStars: number
  numMedia: number
  filterKeywords: string[]
  /** this viewer's own saved pitch for the song; null when they have none */
  pitchPref?: SongPitchPref | null
  reviewMode?: boolean
}

const SongItem = ({
  songId,
  artist,
  title,
  duration,
  onSongQueue,
  onSongStarClick,
  onSongInfo,
  isPlayed,
  isStarred,
  isUpcoming,
  isAdmin,
  numStars,
  numMedia,
  filterKeywords,
  pitchPref,
  reviewMode,
}: SongItemProps) => {
  const t = useT()
  const [isExpanded, setExpanded] = useState(false)

  const handleClick = () => {
    if (ignoreMouseup) ignoreMouseup = false
    else if (reviewMode) onSongInfo(songId)
    else if (!isUpcoming) onSongQueue(songId)
  }
  const handleInfoClick = () => onSongInfo(songId)
  const handleStarClick = () => onSongStarClick(songId)

  const swipeHandlers = useSwipeable({
    onSwipedLeft: ({ event }) => {
      ignoreMouseup = event.type === 'mouseup'
      setExpanded(isAdmin)
    },
    onSwipedRight: ({ event }) => {
      ignoreMouseup = event.type === 'mouseup'
      setExpanded(false)
    },
    preventScrollOnSwipe: true,
    trackMouse: true,
  })

  return (
    <div
      {...swipeHandlers}
      className={clsx(
        styles.container,
        isPlayed && styles.played,
        isUpcoming && styles.upcoming,
        isStarred && styles.starred,
        isExpanded && styles.expanded,
        artist && styles.withArtist,
      )}
    >
      <ToggleAnimation toggle={isUpcoming} className={styles.animateGlow}>
        <div className={styles.duration}>
          {formatDuration(duration)}
          {/* The reminder has to be here, on the row, because this is where
              the song is chosen — in a modal it would arrive too late to
              inform the choice. Dimmed when merely observed rather than
              decided, so a guess never looks like an answer. */}
          {pitchPref && (
            <span
              className={clsx(styles.pitchBadge, pitchPref.source === 'inferred' && styles.pitchInferred)}
              title={pitchPref.source === 'inferred'
                ? `You last sang this at ${formatPitch(pitchPref.pitchSemitones)}`
                : `Your pitch for this song: ${formatPitch(pitchPref.pitchSemitones)}`}
            >
              {formatPitch(pitchPref.pitchSemitones)}
            </span>
          )}
        </div>
        <div onClick={handleClick} className={styles.primary}>
          <div className={styles.title}>
            {filterKeywords?.length ? <Highlighter autoEscape textToHighlight={title} searchWords={filterKeywords} /> : title}
            {isAdmin && numMedia > 1 && (
              <i>
                {' '}
                (
                {numMedia}
                )
              </i>
            )}
            {artist && <div className={styles.artist}>{artist}</div>}
          </div>
        </div>
      </ToggleAnimation>

      <Buttons btnWidth={56} isExpanded={isExpanded}>
        <ButtonStar
          className={styles.btn}
          onClick={handleStarClick}
          isStarred={isStarred}
          count={numStars}
        />
        {/* Admins get this permanently: it opens Song Info, which is also
            where artist/title are corrected, and it used to be reachable only
            by swiping a row left — a gesture with nothing on screen hinting it
            exists. Still hidden for everyone else, who cannot expand a row
            anyway (see onSwipedLeft). */}
        <Button
          onClick={handleInfoClick}
          className={clsx(styles.btn, styles.info)}
          data-hide={!isAdmin}
          title={t('library.songInfoAndEdit')}
          aria-label={t('library.songInfoAndEdit')}
        >
          <Icon icon='INFO_OUTLINE' />
        </Button>
      </Buttons>
    </div>
  )
}

export default SongItem
