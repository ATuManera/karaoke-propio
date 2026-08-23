import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { fetchRooms } from 'store/modules/rooms'
import { createAccount, login } from 'store/modules/user'
import { importRepertoire } from 'store/modules/repertoire'
import Logo from 'components/Logo/Logo'
import SelectRoom from './SelectRoom/SelectRoom'
import InputRadio from 'components/InputRadio/InputRadio'
import Create, { type RepertoireChoice } from './Create/Create'
import SignIn from './SignIn/SignIn'
import styles from './SignedOutView.css'

const SignedOutView = () => {
  const userSectionRef = useRef<HTMLDivElement | null>(null)
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  const prefs = useAppSelector(state => state.prefs)
  const rooms = useAppSelector(state => state.rooms)
  const ui = useAppSelector(state => state.ui)
  const dispatch = useAppDispatch()

  const [mode, setMode] = useState('returning')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [roomPassword, setRoomPassword] = useState('')
  const [showRoomSection, setShowRoomSection] = useState(false)
  const [showAllRooms, setShowAllRooms] = useState(true)
  const [prevRooms, setPrevRooms] = useState<typeof rooms | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)

  // once per mount
  useEffect(() => {
    dispatch(fetchRooms())
  }, [dispatch])

  // An invite code says nothing about which room it opens, so it has to be
  // resolved server-side; the mapping is deliberately not published anywhere.
  const [invitedRoomId, setInvitedRoomId] = useState<number | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  useEffect(() => {
    const code = new URLSearchParams(location.search).get('room')
    if (!code) return

    fetch(`${document.baseURI}api/rooms/code/${encodeURIComponent(code)}`, { credentials: 'same-origin' })
      .then((res): Promise<{ roomId: number }> => res.ok
        ? res.json()
        : Promise.reject(new Error(res.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'This invite is not valid. Ask the host for a new one.')))
      .then((data): undefined => {
        setInvitedRoomId(data.roomId)
        return undefined
      })
      .catch((err: Error): undefined => {
        setInviteError(err.message)
        return undefined
      })
  }, [])

  // room selection visibility/defaults
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (rooms !== prevRooms) {
    setPrevRooms(rooms)
    const searchParams = new URLSearchParams(location.search)
    // ?room=CODE is the invite form; ?roomId=N is kept so links handed out
    // before invite codes existed still work on a LAN
    const roomIdParam = searchParams.get('roomId')
    const id = invitedRoomId ?? (roomIdParam ? parseInt(roomIdParam, 10) : null)
    const password = searchParams.get('password')

    if (id && rooms.entities[id]) {
      setRoomId(id)
      setShowAllRooms(false)

      if (rooms.entities[id]?.hasPassword) {
        if (password) {
          setRoomPassword(atob(password))
          setShowRoomSection(false)
          setFocusRequest(r => r + 1)
        } else {
          setShowRoomSection(true)
        }
      } else {
        setFocusRequest(r => r + 1)
      }
    } else if (rooms.result.length === 1) {
      setRoomId(rooms.result[0])
      setShowRoomSection(rooms.entities[rooms.result[0]]?.hasPassword)
    } else {
      setShowRoomSection(rooms.result.length !== 0)
    }
  }

  const handleRoomSelect = (id: number) => {
    setRoomId(id)
    setMode('returning')

    if (!rooms.entities[id]?.hasPassword || !showRoomSection) {
      setFocusRequest(r => r + 1)
      userSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleFirstFieldRef = (el: HTMLInputElement | null) => {
    if (el) firstFieldRef.current = el
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()

    dispatch(login({
      username: username.trim(),
      password: password,
      roomId,
      roomPassword,
    }))
  }

  const handleCreate = async ({ name, image, passwordConfirm, repertoire }: {
    name: string
    image: Blob | undefined
    passwordConfirm: string
    repertoire: RepertoireChoice
  }) => {
    const data = new FormData()

    data.append('username', username.trim())
    data.append('newPassword', password)
    data.append('newPasswordConfirm', passwordConfirm)
    data.append('roomId', String(roomId))
    data.append('roomPassword', roomPassword)
    data.append('name', name.trim())

    if (typeof image !== 'undefined') {
      data.append('image', image)
    }

    if (mode !== 'returning') {
      data.append('role', mode)
    }

    const created = await dispatch(createAccount(data))

    if (!createAccount.fulfilled.match(created)) return
    if (!repertoire.file && !repertoire.url.trim()) return

    // Applied after the account exists rather than as part of creating it: the
    // person is in either way, and a repertoire that could not be read is a
    // thing to tell them about, not a reason to refuse them the room.
    const imported = await dispatch(importRepertoire({ file: repertoire.file, url: repertoire.url }))

    if (importRepertoire.fulfilled.match(imported)) {
      const { songs, pitches } = imported.payload

      alert(`${songs.matched} of your ${songs.total} songs are in this library`
        + (pitches.applied ? `, and ${pitches.applied} of your pitches are saved.` : '.'))
    } else {
      alert(`You're in, but your repertoire could not be read: ${imported.error.message}`)
    }
  }

  const getAllowed = (roleName: string) => {
    const roleId = prefs.roles.result.find(id => prefs.roles.entities[id].name === roleName)
    return !!rooms.entities[roomId]?.prefs?.roles?.[roleId]?.allowNew
  }

  const allowNewGuest = getAllowed('guest')
  const allowNewStandard = getAllowed('standard')
  const allowNew = allowNewStandard || allowNewGuest

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [focusRequest, mode])

  return (
    <div className={styles.container} style={{ maxWidth: Math.max(340, ui.contentWidth * 0.66) }}>
      <Logo className={styles.logo} />

      {/* a bad invite must say so; otherwise the room picker appears and the
          guest cannot tell the link was the problem */}
      {inviteError && <p className={styles.inviteError}>{inviteError}</p>}

      {showRoomSection && (
        <>
          <h1>Join room...</h1>
          <SelectRoom
            rooms={rooms}
            roomId={roomId}
            roomPassword={roomPassword}
            showAllRooms={showAllRooms}
            onRoomSelect={handleRoomSelect}
            onRoomPasswordChange={setRoomPassword}
          />
        </>
      )}

      <div ref={userSectionRef} className={clsx(rooms.result.length > 1 && roomId === null && styles.hidden)}>
        {allowNew
          ? (
              <>
                <h1>Join as...</h1>
                <div className={styles.radioContainer}>
                  <InputRadio name='type' value='returning' checked={mode === 'returning'} onChange={setMode} label='Returning user' />
                  {allowNewStandard && <InputRadio name='type' value='standard' checked={mode === 'standard'} onChange={setMode} label='New user' />}
                  {allowNewGuest && <InputRadio name='type' value='guest' checked={mode === 'guest'} onChange={setMode} label='Guest' />}
                </div>
              </>
            )
          : <h1>Sign in</h1>}

        {(mode === 'returning' || !allowNew) && (
          <SignIn
            username={username}
            password={password}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
            onFirstFieldRef={handleFirstFieldRef}
          />
        )}

        {mode !== 'returning' && allowNew && (
          <Create
            guest={mode === 'guest'}
            allowRepertoire={prefs.isRepertoireImportEnabled !== false}
            username={username}
            password={password}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleCreate}
            onFirstFieldRef={handleFirstFieldRef}
          />
        )}
      </div>
    </div>
  )
}

export default SignedOutView
