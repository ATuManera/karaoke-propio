import React, { useRef, useState } from 'react'
import Button from 'components/Button/Button'
import InputImage from 'components/InputImage/InputImage'
import styles from './Create.css'
import { useT } from 'lib/i18n'

export interface RepertoireChoice {
  file?: File | null
  url: string
}

interface CreateProps {
  guest: boolean
  username: string
  password: string
  /** whether this installation lets people bring a repertoire with them */
  allowRepertoire: boolean
  onUsernameChange: (username: string) => void
  onPasswordChange: (password: string) => void
  onSubmit: (params: { name: string, image: Blob | undefined, passwordConfirm: string, repertoire: RepertoireChoice }) => void
  onFirstFieldRef: (el: HTMLInputElement | null) => void
}

const Create = ({
  guest,
  username,
  password,
  allowRepertoire,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  onFirstFieldRef,
}: CreateProps) => {
  const t = useT()
  const [name, setName] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [image, setImage] = useState<Blob | undefined>(undefined)
  const repertoireFile = useRef<HTMLInputElement>(null)
  const [repertoireUrl, setRepertoireUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name,
      image,
      passwordConfirm,
      repertoire: { file: repertoireFile.current?.files?.[0], url: repertoireUrl },
    })
  }

  return (
    <form
      className={styles.container}
      noValidate
      onSubmit={handleSubmit}
    >
      {!guest && (
        <>
          <input
            type='email'
            autoComplete='off'
            value={username}
            onChange={e => onUsernameChange(e.target.value)}
            placeholder={t('account.form.username')}
            ref={onFirstFieldRef}
          />
          <input
            type='password'
            autoComplete='new-password'
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            placeholder={t('account.form.password')}
          />
          <input
            type='password'
            autoComplete='new-password'
            placeholder={t('account.form.confirmPassword')}
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
          />
        </>
      )}

      <div className={styles.userDisplayContainer}>
        <InputImage onSelect={setImage} />
        <input
          type='text'
          placeholder={t('account.form.displayName')}
          value={name}
          onChange={e => setName(e.target.value)}
          ref={guest ? onFirstFieldRef : undefined}
        />
      </div>

      {/* Someone arriving with their repertoire is arriving to sing: the file
          is offered here, at the one moment they are already filling in a
          form, rather than after joining and finding the right screen. */}
      {allowRepertoire && (
        <details className={styles.repertoire}>
          <summary>{t('signedOut.haveMyRepertoire')}</summary>

          <p className={styles.repertoireHint}>{t('signedOut.repertoireHint')}</p>

          <input
            type='file'
            accept='application/json,.json'
            ref={repertoireFile}
            className={styles.repertoireFile}
          />

          <div className={styles.repertoireOr}>{t('repertoire.orPasteALink')}</div>

          <input
            type='url'
            inputMode='url'
            placeholder={t('signedOut.repertoireUrlPlaceholder')}
            value={repertoireUrl}
            onChange={e => setRepertoireUrl(e.target.value)}
          />
        </details>
      )}

      <Button type='submit' variant='primary'>
        {t('signedOut.join')}
      </Button>
    </form>
  )
}

export default Create
