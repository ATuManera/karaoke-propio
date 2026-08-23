import React from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setLocale } from 'store/modules/user'
import { getDeviceLocale, getStoredLocale, useT } from 'lib/i18n'
import { getLocaleInfo, LOCALES } from 'shared/i18n'
import styles from './LanguagePicker.css'

interface LanguagePickerProps {
  /** the hint under the control; off where the screen has no room for it */
  showHint?: boolean
  className?: string
}

/**
 * Which language the app speaks to this person in.
 *
 * The empty option is not "English" — it is "whatever this phone asks for",
 * which is the state everyone starts in and the only one that follows a guest
 * from their own phone to a borrowed one. Picking a language is the promise
 * that it travels with the account instead.
 *
 * Signed out (the sign-in and invite screens) the choice still works: it is
 * kept in the browser, and carried onto the account at the moment one exists.
 */
const LanguagePicker = ({ showHint = true, className }: LanguagePickerProps) => {
  const t = useT()
  const dispatch = useAppDispatch()
  const accountLocale = useAppSelector(state => state.user.locale)

  // signed out there is no account to read, so the browser's copy is the
  // record of what was chosen
  const chosen = accountLocale ?? getStoredLocale() ?? ''
  const deviceName = getLocaleInfo(getDeviceLocale())?.nativeName ?? getDeviceLocale()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(setLocale(e.target.value || null))
  }

  return (
    <div className={clsx(styles.container, className)}>
      <label className={styles.label} htmlFor='account-language'>
        {t('account.language.label')}
      </label>

      <select id='account-language' className={styles.select} value={chosen} onChange={handleChange}>
        <option value=''>{t('account.language.auto', { name: deviceName })}</option>
        {LOCALES.map(locale => (
          <option key={locale.code} value={locale.code}>{locale.nativeName}</option>
        ))}
      </select>

      {showHint && <p className={styles.hint}>{t('account.language.hint')}</p>}
    </div>
  )
}

export default LanguagePicker
