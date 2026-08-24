import React, { useState } from 'react'
import Modal from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Slider from 'components/Slider/Slider'
import DedicationField from 'components/DedicationField/DedicationField'
import { formatPitch, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, PITCH_STEP } from 'shared/pitch'
import type { SongPitchPref } from 'shared/types'
import { useT } from 'lib/i18n'
import styles from './PitchModal.css'

interface PitchModalProps {
  title: string
  songTitle: string
  /** the pitch to preselect, e.g. when re-adding an already-cast pitch */
  initialPitch?: number
  /**
   * What this singer previously saved for this song, if anything. Preselects
   * the slider and explains where the number came from. Absent for songs that
   * aren't in the library yet (see AcquisitionModal), which have no songId to
   * hang a preference on.
   */
  savedPref?: SongPitchPref | null
  /**
   * Whether to offer a dedication here. Off by default because this modal is
   * also shown for a song that is still being downloaded (see
   * AcquisitionModal), where there is no queue entry yet to attach one to.
   */
  showDedication?: boolean
  onConfirm(pitchSemitones: number, remember?: boolean, dedication?: string): void
  onClose(): void
}

/**
 * Pitch is chosen per queue request, not per room: this modal is shown once,
 * at the moment a song is added to the queue (see prompt_de_implementacion.md
 * #27). Closing/canceling never adds the song — only Confirm does.
 *
 * It is also where a singer records the pitch that suits their voice for this
 * song, which is a different thing from the pitch of this one performance:
 * the same song is -4 for one person and +2 for another (see migration 012).
 */
const PitchModal = ({ title, songTitle, initialPitch, savedPref, showDedication, onConfirm, onClose }: PitchModalProps) => {
  const t = useT()
  const [pitch, setPitch] = useState(initialPitch ?? savedPref?.pitchSemitones ?? PITCH_DEFAULT)
  // Pre-checked only when there is already a deliberate saved pitch: changing
  // the slider then means correcting it, and silently leaving the old value
  // behind would be the surprising outcome. With nothing saved, or with only
  // an observed 'inferred' value, saving stays an opt-in.
  const [remember, setRemember] = useState(savedPref?.source === 'manual' || savedPref?.source === 'assistant')

  const [dedication, setDedication] = useState('')

  const handleConfirm = () => onConfirm(pitch, remember, dedication)
  const handlePitchChange = (value: number | number[]) => setPitch(value as number)
  const handleRememberChange = (e: React.ChangeEvent<HTMLInputElement>) => setRemember(e.target.checked)

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={title}
      buttons={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant='primary' onClick={handleConfirm}>{t('pitch.addToQueue')}</Button>
        </>
      )}
    >
      <div className={styles.container}>
        <p className={styles.songTitle} translate='no'>{songTitle}</p>

        <div className={styles.field}>
          <div className={styles.fieldHeading}>
            <label id='label-pitch-semitones'>{t('pitch.title')}</label>
            <output className={styles.value} aria-live='polite'>
              {formatPitch(pitch)}
            </output>
          </div>
          <Slider
            min={PITCH_MIN}
            max={PITCH_MAX}
            step={PITCH_STEP}
            value={pitch}
            onChange={handlePitchChange}
            className={styles.slider}
            aria-labelledby='label-pitch-semitones'
          />

          {savedPref && (
            <p className={styles.savedHint}>
              {savedPref.source === 'inferred'
                ? `You last sang this at ${formatPitch(savedPref.pitchSemitones)}`
                : `Your pitch for this song: ${formatPitch(savedPref.pitchSemitones)}`}
            </p>
          )}
        </div>

        {/* Asked for here because this is already the moment the singer is
            thinking about the song, and one dialog beats two. Optional in the
            plainest way there is: leaving it empty queues the song exactly as
            before, and it can still be written from the queue afterwards. */}
        {showDedication && (
          <DedicationField
            id='queue-dedication'
            label={t('dedication.optional')}
            value={dedication}
            placeholder={t('dedication.placeholder')}
            hint={t('dedication.hintOwn')}
            onChange={setDedication}
          />
        )}

        {/* Undefined means there is no song to hang a preference on yet (see
            AcquisitionModal); null means there is one and nothing is saved. */}
        {savedPref !== undefined && (
          <InputCheckbox
            checked={remember}
            onChange={handleRememberChange}
            label={remember || !savedPref || savedPref.source === 'inferred'
              ? t('pitch.rememberForMe')
              : t('pitch.forgetMine')}
          />
        )}
      </div>
    </Modal>
  )
}

export default PitchModal
