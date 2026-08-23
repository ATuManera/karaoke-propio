import React, { useRef } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { createUser, removeUser, updateUser } from '../../../modules/users'
import { importRepertoire } from 'store/modules/repertoire'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import AccountForm from '../../AccountForm/AccountForm'
import { UserWithRole } from 'shared/types'
import styles from './EditUser.css'

interface EditUserProps {
  user?: UserWithRole
  onClose: () => void
}

const EditUser = ({ user, onClose }: EditUserProps) => {
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
      alert('Choose a repertoire file first.')
      return
    }

    const imported = await dispatch(importRepertoire({ file, userId: user.userId }))

    if (importRepertoire.fulfilled.match(imported)) {
      const { songs, pitches } = imported.payload

      alert(`${songs.matched} of ${songs.total} songs are in this library`
        + (pitches.applied ? `, and ${pitches.applied} pitches were saved for ${user.name}.` : '.'))
    } else {
      alert(imported.error.message)
    }
  }

  const handleRemoveClick = () => {
    if (user && confirm(`Remove user "${user.username}"?\n\nTheir queued songs will also be removed.`)) {
      dispatch(removeUser(user.userId))
    }
  }

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={user ? user.username : 'Create User'}
    >
      <AccountForm user={user} onSubmit={handleSubmit} showRole autoFocus={!user}>
        <div className={styles.btnContainer}>
          {!user && (
            <Button type='submit' className={styles.btn} variant='primary'>
              Create User
            </Button>
          )}

          {user && (
            <Button type='submit' className={styles.btn} variant='primary'>
              Update User
            </Button>
          )}

          {user && (
            <Button onClick={handleRemoveClick} className={styles.btn} variant='danger'>
              Remove User
            </Button>
          )}

          <Button onClick={onClose} variant='default'>
            Cancel
          </Button>
        </div>
      </AccountForm>

      {user && (
        <div className={styles.repertoire}>
          <label htmlFor='user-repertoire'>Repertoire from another Karaoke Propio</label>

          <input
            id='user-repertoire'
            type='file'
            accept='application/json,.json'
            ref={repertoireFile}
          />

          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? 'Reading…' : `Import for ${user.name}`}
          </Button>
        </div>
      )}
    </Modal>
  )
}

export default EditUser
