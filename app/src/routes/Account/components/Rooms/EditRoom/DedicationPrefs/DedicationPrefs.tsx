import React from 'react'
import Accordion from 'components/Accordion/Accordion'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Icon from 'components/Icon/Icon'
import { areDedicationsShown } from 'shared/dedication'
import type { IRoomPrefs } from 'shared/types'
import styles from './DedicationPrefs.css'
import { useT } from 'lib/i18n'

interface DedicationPrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
}

/**
 * Whether this room is taking dedications at all.
 *
 * On for a room that has never been asked — see areDedicationsShown, which is
 * the one place that rule is written down. Off turns the whole feature off
 * for the room: no carousel on the television, no field when a song is
 * queued, no button in the queue, and the server refuses a write from a tab
 * that was left open from before.
 *
 * What it does not do is delete anything. Every message stays exactly where
 * it was and reappears the moment this is turned back on, which is what makes
 * it a switch an admin can flip mid-party without weighing what it costs.
 */
const DedicationPrefs = ({ onChange, prefs = {} }: DedicationPrefsProps) => {
  const t = useT()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...prefs, dedications: { isEnabled: e.currentTarget.checked } })
  }

  return (
    <Accordion
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='MESSAGE' />
          <div className={styles.title}>{t('rooms.dedications.title')}</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <InputCheckbox
            label={t('rooms.dedications.show')}
            checked={areDedicationsShown(prefs)}
            onChange={handleChange}
          />
        </div>
        <p className={styles.hint}>{t('rooms.dedications.hint')}</p>
      </div>
    </Accordion>
  )
}

export default DedicationPrefs
