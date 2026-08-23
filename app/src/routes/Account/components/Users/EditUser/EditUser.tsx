import React, { useRef } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { createUser, removeUser, updateUser } from '../../../modules/users'
import { importRepertoire } from 'store/modules/repertoire'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import AccountForm from '../../AccountForm/AccountForm'
import { UserWithRole } from 'shared/types'
import styles from './EditUser.css'
import { useT } from 'lib/i18n'

interface EditUserProps {
  user?: UserWithRole
  onClose: () => void
}

const EditUser = ({ user, onClose }: EditUserProps) => {
  const t = useT()
  const dispatch = useAppDispatch()
  const isImporting = useAppSelector(state => state.repertoire.isImporting)
  const repertoireFile = useRef<HTMLInputElement>(null)

  const handleSubmit = (data: FormData) => {
    if (user) dispatch(updateUser({ userId: user.userId, data }))
    else dispatch(createUser(data))
  }

  // An admin applying somebody else's file for them: the singer who is not
  // going to work out the file picker on their own phone, and the account that
  // is going to keep this repertoire between parties.
  const handleImport = async () => {
    const file = repertoireFile.current?.files?.[0]

    if (!user || !file) {
      alert(t('users.repertoireChooseFirst'))
      return
    }

    const imported = await dispatch(importRepertoire({ file, userId: user.userId }))

    if (importRepertoire.fulfilled.match(imported)) {
      const { songs, pitches } = imported.payload

      alert(t('users.repertoireImported', { matched: songs.matched, total: songs.total, count: songs.total })
        + (pitches.applied
          ? t('users.repertoirePitchesSaved', { count: pitches.applied, name: user.name })
          : '.'))
    } else {
      alert(imported.error.message)
    }
  }

  const handleRemoveClick = () => {
    if (user && confirm(t('users.confirmRemove', { username: user.username }))) {
      dispatch(removeUser(user.userId))
    }
  }

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={user ? user.username : t('users.createUser')}
    >
      <AccountForm user={user} onSubmit={handleSubmit} showRole autoFocus={!user}>
        <div className={styles.btnContainer}>
          {!user && (
            <Button type='submit' className={styles.btn} variant='primary'>
              {t('users.createUser')}
            </Button>
          )}

          {user && (
            <Button type='submit' className={styles.btn} variant='primary'>
              {t('users.updateUser')}
            </Button>
          )}

          {user && (
            <Button onClick={handleRemoveClick} className={styles.btn} variant='danger'>
              {t('users.removeUser')}
            </Button>
          )}

          <Button onClick={onClose} variant='default'>
            {t('common.cancel')}
          </Button>
        </div>
      </AccountForm>

      {user && (
        <div className={styles.repertoire}>
          <label htmlFor='user-repertoire'>{t('users.repertoireTitle')}</label>

          <input
            id='user-repertoire'
            type='file'
            accept='application/json,.json'
            ref={repertoireFile}
          />

          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? t('common.reading') : t('users.importFor', { name: user.name })}
          </Button>
        </div>
      )}
    </Modal>
  )
}

export default EditUser
