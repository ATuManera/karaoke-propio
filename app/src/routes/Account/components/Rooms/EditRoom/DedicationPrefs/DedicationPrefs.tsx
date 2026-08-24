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
 * Whether this room's player shows what people wrote on their songs.
 *
 * On for a room that has never been asked — see areDedicationsShown, which is
 * the one place that rule is written down. Turning it off hides the carousel
 * and nothing else: the dedications stay where they are, singers can go on
 * writing them, and everything reappears when it is turned back on. That is
 * what makes this a switch an admin can flip during a party without having to
 * think about what it costs.
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
