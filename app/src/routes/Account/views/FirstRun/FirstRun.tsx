import React from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { createAccount } from 'store/modules/user'
import Button from 'components/Button/Button'
import Logo from 'components/Logo/Logo'
import { Trans } from 'react-i18next'
import { msg, useT } from 'lib/i18n'
import AccountForm from '../../components/AccountForm/AccountForm'
import styles from './FirstRun.css'

const FirstRun = () => {
  const t = useT()
  const ui = useAppSelector(state => state.ui)

  const dispatch = useAppDispatch()
  const handleCreate = (data: FormData) => {
    dispatch(createAccount(data))
  }

  return (
    <div className={styles.container} style={{ maxWidth: Math.max(340, ui.contentWidth * 0.66) }}>
      <Logo className={styles.logo} />
      <h1>{t('signedOut.welcome')}</h1>
      <p>
        <Trans i18nKey={msg('signedOut.firstRunIntro')} components={{ b: <b /> }} />
      </p>
      <AccountForm onSubmit={handleCreate} autoFocus>
        <Button variant='primary' type='submit'>
          {t('signedOut.createAccount')}
        </Button>
      </AccountForm>
    </div>

  )
}

export default FirstRun
