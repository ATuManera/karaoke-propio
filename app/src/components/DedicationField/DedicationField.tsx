import React from 'react'
import clsx from 'clsx'
import { DEDICATION_MAX_LENGTH, dedicationLength, sanitizeDedication } from 'shared/dedication'
import { useT } from 'lib/i18n'
import styles from './DedicationField.css'

interface DedicationFieldProps {
  id: string
  label: string
  value: string
  hint?: string
  placeholder?: string
  autoFocus?: boolean
  className?: string
  onChange(text: string): void
}

/**
 * The box a dedication is written in, shared by the two places one can be
 * written: alongside the pitch when a song is queued, and on its own from the
 * queue afterwards.
 *
 * A textarea rather than an input because people type long-ish greetings and
 * want to see all of it, but the text is still one line by the time it is
 * stored — sanitizeDedication folds the newlines away (see shared/dedication),
 * and the counter below counts what will actually survive that, not what has
 * been typed. Anything else would let someone fill the counter with spaces and
 * then wonder why Save appeared to do nothing.
 */
const DedicationField = ({
  id, label, value, hint, placeholder, autoFocus, className, onChange,
}: DedicationFieldProps) => {
  const t = useT()
  const remaining = DEDICATION_MAX_LENGTH - dedicationLength(sanitizeDedication(value))

  return (
    <div className={clsx(styles.field, className)}>
      <div className={styles.heading}>
        <label htmlFor={id}>{label}</label>
        <output className={clsx(styles.counter, remaining === 0 && styles.full)} aria-live='polite'>
          {t('dedication.charsLeft', { count: remaining })}
        </output>
      </div>

      <textarea
        id={id}
        className={styles.input}
        value={value}
        rows={3}
        // one over the limit, so the counter can reach zero and stop rather
        // than silently swallowing the next keystroke without explanation
        maxLength={DEDICATION_MAX_LENGTH + 1}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
      />

      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}

export default DedicationField
