import React, { useState } from 'react'
import Modal from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import Slider from 'components/Slider/Slider'
import { formatPitch, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, PITCH_STEP } from 'shared/pitch'
import styles from './PitchModal.css'

interface PitchModalProps {
  title: string
  songTitle: string
  /** the pitch to preselect, e.g. when re-adding an already-cast pitch */
  initialPitch?: number
  onConfirm(pitchSemitones: number): void
  onClose(): void
}

/**
 * Pitch is chosen per queue request, not per room: this modal is shown once,
 * at the moment a song is added to the queue (see prompt_de_implementacion.md
 * #27). Closing/canceling never adds the song — only Confirm does.
 */
const PitchModal = ({ title, songTitle, initialPitch = PITCH_DEFAULT, onConfirm, onClose }: PitchModalProps) => {
  const [pitch, setPitch] = useState(initialPitch)

  const handleConfirm = () => onConfirm(pitch)
  const handlePitchChange = (value: number | number[]) => setPitch(value as number)

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={title}
      buttons={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant='primary' onClick={handleConfirm}>Add to queue</Button>
        </>
      )}
    >
      <div className={styles.container}>
        <p className={styles.songTitle} translate='no'>{songTitle}</p>

        <div className={styles.field}>
          <div className={styles.fieldHeading}>
            <label id='label-pitch-semitones'>Pitch</label>
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
        </div>
      </div>
    </Modal>
  )
}

export default PitchModal
