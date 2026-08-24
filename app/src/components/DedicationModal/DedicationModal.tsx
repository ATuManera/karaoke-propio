import React, { useState } from 'react'
import { useAppDispatch } from 'store/hooks'
import Modal from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import DedicationField from 'components/DedicationField/DedicationField'
import { removeDedication, setDedication } from 'routes/Queue/modules/queue'
import { sanitizeDedication } from 'shared/dedication'
import { useT } from 'lib/i18n'
import type { Dedication } from 'shared/types'
import styles from './DedicationModal.css'

interface DedicationModalProps {
  queueId: number
  songTitle: string
  dedications: Dedication[]
  /** the reader, so their own message can be told from everyone else's */
  userId: number
  isAdmin: boolean
  onClose(): void
}

/**
 * What will be said over one song, and who may change it.
 *
 * A singer sees one box: their own message, which they can rewrite or clear
 * for as long as the song is in the queue. An admin sees the same box plus
 * everything else written on that song, each with an Edit that loads it here
 * — editing in place, so a correction stays signed by whoever wrote it rather
 * than being quietly taken over.
 *
 * Nothing is saved optimistically: the server folds newlines, trims and cuts
 * the text to length (see shared/dedication), so the phone showing its own
 * draft would briefly show something other than the television is about to.
 */
const DedicationModal = ({ queueId, songTitle, dedications, userId, isAdmin, onClose }: DedicationModalProps) => {
  const t = useT()
  const dispatch = useAppDispatch()

  const mine = dedications.find(d => d.userId === userId) ?? null
  // null means "my own message", which may not exist yet; anything else is an
  // existing row being corrected in place
  const [target, setTarget] = useState<Dedication | null>(mine)
  const [draft, setDraft] = useState(mine?.text ?? '')

  const isMine = target === null || target.userId === userId
  const others = dedications.filter(d => d.dedicationId !== target?.dedicationId && d.userId !== userId)

  const handleEditOther = (dedication: Dedication) => {
    setTarget(dedication)
    setDraft(dedication.text)
  }

  const handleRemoveOther = (dedication: Dedication) => {
    if (window.confirm(t('dedication.confirmRemove'))) {
      dispatch(removeDedication({ dedicationId: dedication.dedicationId }))
    }
  }

  // Editing someone else's message is a detour, not a destination: without
  // this an admin who tapped Edit to read what a singer wrote would have no
  // way back to writing their own but to close the dialog.
  const handleWriteMine = () => {
    setTarget(mine)
    setDraft(mine?.text ?? '')
  }

  const handleRemove = () => {
    if (!target) return

    if (window.confirm(t('dedication.confirmRemove'))) {
      dispatch(removeDedication({ dedicationId: target.dedicationId }))
      onClose()
    }
  }

  const handleSave = () => {
    // An existing row is addressed by id so its author is preserved; my own
    // message needs no id at all — the server replaces whatever I said before.
    dispatch(setDedication(queueId, draft, isMine ? undefined : target.dedicationId))
    onClose()
  }

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={t('dedication.title')}
      buttons={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant='primary' onClick={handleSave}>{t('dedication.save')}</Button>
        </>
      )}
    >
      <div className={styles.container}>
        <p className={styles.songTitle} translate='no'>{songTitle}</p>

        <DedicationField
          id='dedication-text'
          label={isMine ? t('dedication.editingMine') : t('dedication.editingFor', { name: target.userDisplayName })}
          value={draft}
          placeholder={t('dedication.placeholder')}
          hint={isMine && !isAdmin ? t('dedication.hintOwn') : t('dedication.hint')}
          autoFocus
          onChange={setDraft}
        />

        <div className={styles.actions}>
          {!isMine && (
            <Button onClick={handleWriteMine}>{t('dedication.writeMine')}</Button>
          )}

          {/* only offered once there is something on screen to take down */}
          {target && sanitizeDedication(target.text) !== '' && (
            <Button variant='danger' onClick={handleRemove}>
              {t('dedication.remove')}
            </Button>
          )}
        </div>

        {others.length > 0 && (
          <div className={styles.others}>
            <h2 className={styles.othersHeading}>{t('dedication.others')}</h2>

            {others.map(dedication => (
              <div key={dedication.dedicationId} className={styles.other}>
                <div className={styles.otherText}>
                  <span translate='no'>{dedication.text}</span>
                  <span className={styles.otherAuthor} translate='no'>
                    {t('dedication.onScreen.from', { name: dedication.userDisplayName })}
                  </span>
                </div>

                {/* a singer sees what else will appear over their song, but
                    only an admin may touch someone else's words */}
                {isAdmin && (
                  <div className={styles.otherButtons}>
                    <Button onClick={() => handleEditOther(dedication)}>{t('dedication.edit')}</Button>
                    <Button variant='danger' onClick={() => handleRemoveOther(dedication)}>
                      {t('dedication.remove')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && <p className={styles.adminHint}>{t('dedication.adminHint')}</p>}
      </div>
    </Modal>
  )
}

export default DedicationModal
