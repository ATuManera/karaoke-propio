import React, { useEffect } from 'react'
import { Trans } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { msg, translate, useT } from 'lib/i18n'
import Button from 'components/Button/Button'
import Icon from 'components/Icon/Icon'
import { clearPitchFeedback, respondPitchFeedback } from 'store/modules/userPitchFeedback'
import { formatPitch, PITCH_MAX, PITCH_MIN } from 'shared/pitch'
import { PITCH_FEEDBACK_TTL_MS, type PitchFeedbackChoice, type PitchFeedbackResolved } from 'shared/pitchFeedback'
import type { MessageKey } from 'shared/i18n'
import styles from './PitchFeedbackPrompt.css'

/** High to low, the way the answers sit on a scale. */
const CHOICES: { choice: PitchFeedbackChoice, key: MessageKey, isWide?: boolean }[] = [
  { choice: 'much_too_high', key: 'pitch.feedback.tooHigh' },
  { choice: 'slightly_high', key: 'pitch.feedback.aLittleHigh' },
  { choice: 'good', key: 'pitch.feedback.justRight', isWide: true },
  { choice: 'slightly_low', key: 'pitch.feedback.aLittleLow' },
  { choice: 'much_too_low', key: 'pitch.feedback.tooLow' },
]

/** How long the confirmation stays up before the sheet gets out of the way. */
const CONFIRMATION_MS = 5000

function getConfirmation (performedPitch: number, { pitchSemitones, limit }: PitchFeedbackResolved): string {
  if (pitchSemitones === null) {
    return limit === 'min'
      ? translate('pitch.feedback.stillTooHigh', { pitch: formatPitch(PITCH_MIN) })
      : translate('pitch.feedback.stillTooLow', { pitch: formatPitch(PITCH_MAX) })
  }

  if (limit) {
    return translate(
      limit === 'min' ? 'pitch.feedback.savedAtLowest' : 'pitch.feedback.savedAtHighest',
      { pitch: formatPitch(pitchSemitones) },
    )
  }

  return pitchSemitones === performedPitch
    ? translate('pitch.feedback.saved')
    : translate('pitch.feedback.savedNextTime', { pitch: formatPitch(pitchSemitones) })
}

/**
 * "How was that pitch?", asked the moment a song ends, of the person who just
 * sang it.
 *
 * That moment is the only one where the answer costs nothing: they have just
 * heard themselves sing the whole thing, chorus and difficult bits included, so
 * there is nothing to test and nothing to remember. The alternative — a slider
 * before singing — asks people to predict something they can only find out
 * afterwards.
 *
 * A sheet rather than a modal: it can be ignored while they carry on browsing,
 * queueing or looking at photos, which is what people are actually doing at that
 * moment. Never shown on the Player (see CoreLayout) — the TV is the room's
 * screen, and this question belongs to one person.
 */
const PitchFeedbackPrompt = () => {
  const t = useT()
  const dispatch = useAppDispatch()
  const { prompt, resolution, isSubmitting } = useAppSelector(state => state.userPitchFeedback)
  const songs = useAppSelector(state => state.songs.entities)
  const artists = useAppSelector(state => state.artists.entities)
  const footerHeight = useAppSelector(state => state.ui.footerHeight)

  // Lapse locally too, so a question the server has already forgotten stops
  // inviting an answer it can no longer record. expiresAt is the server's
  // clock: honoured when it lands inside the window it should, and otherwise
  // ignored in favour of the full life — a phone with a wrong clock should not
  // lose the question the instant it arrives.
  useEffect(() => {
    if (!prompt) return

    const remaining = prompt.expiresAt - Date.now()
    const ms = remaining > 0 && remaining <= PITCH_FEEDBACK_TTL_MS ? remaining : PITCH_FEEDBACK_TTL_MS
    const timer = setTimeout(() => dispatch(clearPitchFeedback()), ms)

    return () => clearTimeout(timer)
  }, [dispatch, prompt])

  useEffect(() => {
    if (!resolution) return

    const timer = setTimeout(() => dispatch(clearPitchFeedback()), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [dispatch, resolution])

  if (!prompt) return null

  const song = songs[prompt.songId]
  const artist = song ? artists[song.artistId]?.name : undefined

  const handleRespond = (choice: PitchFeedbackChoice) => {
    dispatch(respondPitchFeedback(prompt.feedbackId, choice))
  }

  // Closing is an answer too — the answer "leave my pitch alone". It resolves
  // the question server-side so it doesn't come back on the next reconnect,
  // and writes nothing, exactly like "Not sure".
  //
  // Once it has been answered there is nothing left to answer, and saying
  // 'unsure' again asked the server about a question it had already forgotten
  // — which came back as "That question is no longer waiting for an answer",
  // in a dialog, on top of the confirmation the singer was reading. The X is
  // the same button in both states; what it means changes with them.
  const handleDismiss = () => {
    if (resolution) dispatch(clearPitchFeedback())
    else handleRespond('unsure')
  }

  return (
    <div
      className={styles.container}
      style={{ bottom: footerHeight }}
      role='dialog'
      aria-modal='false'
      aria-labelledby='pitch-feedback-title'
    >
      <div className={styles.sheet}>
        <div className={styles.heading}>
          <Icon icon='TUNE' size={24} className={styles.icon} />
          <h2 id='pitch-feedback-title' className={styles.title}>{t('pitch.feedback.title')}</h2>
          <Button
            icon='CLEAR'
            className={styles.close}
            onClick={handleDismiss}
            disabled={isSubmitting}
            aria-label={t('pitch.feedback.closeWithoutSaving')}
          />
        </div>

        {/* the library copy can lag behind a song being added; the question is
            still answerable without knowing what it was called */}
        <p className={styles.song} translate='no'>
          {song ? song.title : t('pitch.feedback.subtitle')}
          {artist && <span className={styles.artist}>{artist}</span>}
        </p>

        <p className={styles.performed}>
          <Trans
            i18nKey={msg('pitch.feedback.youSangItAt')}
            components={{ b: <strong /> }}
            values={{ pitch: formatPitch(prompt.pitchSemitones) }}
          />
        </p>

        {resolution
          ? (
              <p className={styles.confirmation} role='status'>
                {getConfirmation(prompt.pitchSemitones, resolution)}
              </p>
            )
          : (
              <>
                <div className={styles.choices}>
                  {CHOICES.map(({ choice, key, isWide }) => (
                    <Button
                      key={choice}
                      className={isWide ? styles.wideChoice : styles.choice}
                      onClick={() => handleRespond(choice)}
                      disabled={isSubmitting}
                    >
                      {t(key)}
                    </Button>
                  ))}
                </div>

                <a className={styles.unsure} onClick={isSubmitting ? undefined : handleDismiss}>
                  {t('pitch.feedback.notSure')}
                </a>
              </>
            )}
      </div>
    </div>
  )
}

export default PitchFeedbackPrompt
