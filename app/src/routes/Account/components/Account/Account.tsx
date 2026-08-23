import React, { useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { requestLogout, updateAccount } from 'store/modules/user'
import { removeItem } from 'routes/Queue/modules/queue'
import getUpcoming from 'routes/Queue/selectors/getUpcoming'
import Panel from 'components/Panel/Panel'
import LanguagePicker from 'components/LanguagePicker/LanguagePicker'
import Button from 'components/Button/Button'
import AccountForm from '../AccountForm/AccountForm'
import { msg, useT } from 'lib/i18n'
import styles from './Account.css'

const Account = () => {
  const t = useT()
  const dispatch = useAppDispatch()
  const user = useAppSelector(state => state.user)
  const upcomingQueueIds = useAppSelector(state => getUpcoming(state, user.userId))

  const curPassword = useRef(null)
  const [isDirty, setDirty] = useState(false)

  const handleSignOut = () => {
    if (!user.isAdmin) {
      const hasUpcomingSongs = upcomingQueueIds.length > 0
      let message = ''

      if (user.isGuest && hasUpcomingSongs) {
        message = `${t('account.confirmSignOut')}\n\n${t('account.signOutGuestLosesQueueAndAccount')}`
      } else if (user.isGuest) {
        message = `${t('account.confirmSignOut')}\n\n${t('account.signOutGuestIsFinal')}`
      } else if (hasUpcomingSongs) {
        message = `${t('account.confirmSignOut')}\n\n${t('account.signOutLosesQueue')}`
      }

      if (message && !confirm(message)) return

      if (hasUpcomingSongs) {
        dispatch(removeItem({ queueId: upcomingQueueIds }))
      }
    }

    dispatch(requestLogout())
  }

  const handleSubmit = (data: FormData) => {
    if (!user.isGuest) {
      if (!curPassword.current.value.trim()) {
        alert(t('account.currentPasswordRequired'))
        curPassword.current.focus()
        return
      }

      data.append('password', curPassword.current.value)
    }

    dispatch(updateAccount(data))
  }

  return (
    <Panel title={t('account.title')} contentClassName={styles.content}>
      <>
        <p>
          <Trans
            i18nKey={msg('account.signedInAs')}
            components={{ b: <strong /> }}
            values={{ name: user.isGuest ? t('account.guest') : user.username }}
          />
        </p>

        <AccountForm
          user={user}
          onDirtyChange={setDirty}
          onSubmit={handleSubmit}
          showUsername={!user.isGuest}
          showPassword={!user.isGuest}
        >
          {isDirty && !user.isGuest && (
            <input
              type='password'
              autoComplete='current-password'
              placeholder={t('account.currentPassword')}
              ref={curPassword}
            />

          )}

          <LanguagePicker className={styles.language} />

          <div className={styles.btnContainer}>
            {isDirty && (
              <Button type='submit' variant='primary'>
                {t('account.updateAccount')}
              </Button>
            )}
            <Button onClick={handleSignOut} variant='default'>
              {t('account.signOut')}
            </Button>
          </div>
        </AccountForm>
      </>
    </Panel>
  )
}

export default Account
