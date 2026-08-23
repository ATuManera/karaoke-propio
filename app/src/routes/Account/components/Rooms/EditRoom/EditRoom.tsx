import React, { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from 'store/hooks'
import { createRoom, removeRoom, updateRoom, requestPrefsPush } from 'store/modules/rooms'
import { getFormData } from 'lib/util'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import UserPrefs from './UserPrefs/UserPrefs'
import QRPrefs from './QRPrefs/QRPrefs'
import type { Room, IRoomPrefs } from 'shared/types'
import styles from './EditRoom.css'
import { useT } from 'lib/i18n'

interface EditRoomProps {
  room?: Room
  onClose: () => void
}

const EditRoom = ({ onClose, room }: EditRoomProps) => {
  const t = useT()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // A room being created has no id yet, and no code to show: the dependency
  // array is read on every render, so reaching into `room` here at all is what
  // took the whole screen down when the editor was opened empty.
  useEffect(() => {
    if (!room) return

    fetch(`${document.baseURI}api/rooms/${room.roomId}/code`, { credentials: 'same-origin' })
      .then((res): Promise<{ code: string }> => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data): undefined => {
        setInviteCode(data.code)
        return undefined
      })
      .catch((): undefined => undefined)
  }, [room])

  const handleRegenerateCode = () => {
    if (!room) return
    if (!window.confirm(t('rooms.confirmNewCode'))) return

    setIsRegenerating(true)
    fetch(`${document.baseURI}api/rooms/${room.roomId}/code`, { method: 'POST', credentials: 'same-origin' })
      .then((res): Promise<{ code: string }> => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data): undefined => {
        setInviteCode(data.code)
        setIsRegenerating(false)
        return undefined
      })
      .catch((): undefined => {
        setIsRegenerating(false)
        return undefined
      })
  }

  const formRef = useRef(null)
  const [roomPassword, setRoomPassword] = useState(room && room.hasPassword ? '*'.repeat(32) : '')
  const [prefs, setPrefs] = useState<IRoomPrefs>(room?.prefs || {} as IRoomPrefs)
  const [prevRoom, setPrevRoom] = useState(room)
  const [isPasswordDirty, setIsPasswordDirty] = useState(false)
  const dispatch = useAppDispatch()

  if (room !== prevRoom) {
    setPrevRoom(room)
    if (room?.prefs) setPrefs(room.prefs)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const data = getFormData(new FormData(formRef.current)) as Record<string, string | IRoomPrefs>
    data.prefs = prefs

    if (room) {
      if (!isPasswordDirty) delete data.password
      dispatch(updateRoom({ roomId: room.roomId, data }))
    } else {
      if (!data.password) delete data.password
      dispatch(createRoom(data))
    }
  }

  const handleRemoveClick = () => {
    if (room && confirm(t('rooms.confirmRemove', { name: room.name }))) {
      dispatch(removeRoom(room.roomId))
    }
  }

  const handlePrefsChange = (newPrefs: IRoomPrefs) => {
    setPrefs(newPrefs)
    if (room) {
      dispatch(requestPrefsPush(room.roomId, newPrefs))
    }
  }

  const handleClose = () => {
    // emit initial prefs
    if (room) {
      dispatch(requestPrefsPush(room.roomId, room.prefs))
    }
    onClose()
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPasswordDirty(true)
    setRoomPassword(e.target.value)
  }

  return (
    <Modal
      className={styles.modal}
      onClose={handleClose}
      title={room ? t('rooms.editRoom') : t('rooms.createRoom')}
    >
      <form onSubmit={handleSubmit} ref={formRef} className={styles.form}>
        <div className={styles.fieldContainer}>
          <input
            type='text'
            autoComplete='off'
            defaultValue={room ? room.name : ''}
            name='name'
            placeholder={t('rooms.roomName')}
            // https://github.com/facebook/react/issues/23301
            ref={r => typeof room === 'undefined' ? r?.setAttribute('autofocus', 'true') : undefined}
          />

          <input
            type='password'
            autoComplete='new-password'
            value={roomPassword}
            name='password'
            onChange={handlePasswordChange}
            onFocus={e => e.target.select()}
            placeholder={t('rooms.roomPassword')}
          />

          {/* Regenerating invalidates every invite already handed out — the
              way to shut out a link that leaked or a guest who should no
              longer have access, without disturbing anyone already in. */}
          {room && (
            <div className={styles.inviteRow}>
              <span>
                Invite code:
                {' '}
                <strong>{inviteCode ?? '…'}</strong>
              </span>
              <Button onClick={handleRegenerateCode} disabled={isRegenerating}>
                {isRegenerating ? t('rooms.generating') : t('rooms.newCode')}
              </Button>
            </div>
          )}

          <select
            name='status'
            defaultValue={room?.status ?? 'open'}
          >
            <option value='open'>{t('rooms.open')}</option>
            <option value='closed'>{t('rooms.closed')}</option>
          </select>
        </div>

        <div className={styles.prefsContainer}>
          <UserPrefs prefs={prefs} onChange={handlePrefsChange} />
          <QRPrefs prefs={prefs} onChange={handlePrefsChange} roomPassword={roomPassword} roomPasswordDirty={isPasswordDirty} />
        </div>

        <div className={styles.btnContainer}>
          <Button type='submit' variant='primary' className={styles.btn}>
            {room ? t('rooms.updateRoom') : t('rooms.createRoom')}
          </Button>
          {room && (
            <Button onClick={handleRemoveClick} className={styles.btn} variant='danger'>
              {t('rooms.removeRoom')}
            </Button>
          )}
          <Button onClick={handleClose} variant='default'>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default EditRoom
