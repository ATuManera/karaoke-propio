import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import Button from 'components/Button/Button'
import { ROOM_CODE_LENGTH, normalizeRoomCode } from 'shared/roomCode'
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
  const [prevInvitedRoomId, setPrevInvitedRoomId] = useState<number | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [codeEntry, setCodeEntry] = useState('')
  const [isCheckingCode, setIsCheckingCode] = useState(false)

  const resolveInvite = useCallback((code: string) => fetch(`${document.baseURI}api/rooms/code/${encodeURIComponent(code)}`, { credentials: 'same-origin' })
    .then((res): Promise<{ roomId: number }> => res.ok
      ? res.json()
      : Promise.reject(new Error(res.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : 'This invite is not valid. Ask the host for a new one.')))
    .then((data): undefined => {
      setInvitedRoomId(data.roomId)
      setInviteCode(code)
      setIsCheckingCode(false)
      return undefined
    })
    .catch((err: Error): undefined => {
      setInviteError(err.message)
      setIsCheckingCode(false)
      return undefined
    }), [])

  useEffect(() => {
    const code = new URLSearchParams(location.search).get('room')
    if (code) resolveInvite(code)
  }, [resolveInvite])

  // The code is meant to survive being dictated — that is why its alphabet
  // leaves out the characters people mishear — so there has to be somewhere to
  // type it. A scanned QR fills it in through the URL; a code read out over
  // the phone arrives here.
  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = normalizeRoomCode(codeEntry)

    if (code.length !== ROOM_CODE_LENGTH) {
      setInviteError(`An invite code is ${ROOM_CODE_LENGTH} characters.`)
      return
    }

    setInviteError(null)
    setIsCheckingCode(true)
    resolveInvite(code)
  }

  // room selection visibility/defaults
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (rooms !== prevRooms || invitedRoomId !== prevInvitedRoomId) {
    setPrevRooms(rooms)
    setPrevInvitedRoomId(invitedRoomId)
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
    } else {
      // Never picked for them, not even when there is only one room. Someone
      // signing in may be at the party the room already has, or away from home
      // and wanting one of their own; only they know which, and being put in a
      // room silently is how they end up in somebody else's.
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
    data.append('roomCode', inviteCode ?? '')
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

  // Making an account is for people who were invited to this room, and the
  // invite is the code they arrived with — checked again server-side, since a
  // hidden radio button has never stopped anyone. Someone who already has an
  // account signs in as before: their password is their invitation.
  const hasInvite = inviteCode !== null && invitedRoomId !== null && invitedRoomId === roomId

  const allowNewGuest = hasInvite && getAllowed('guest')
  const allowNewStandard = hasInvite && getAllowed('standard')
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
          <h1>Which room?</h1>

          {rooms.result.length > 1 && (
            <p className={styles.roomHint}>
              Join the party already going, or take a room nobody is in and
              start your own.
            </p>
          )}

          <SelectRoom
            rooms={rooms}
            roomId={roomId}
            roomPassword={roomPassword}
            showAllRooms={showAllRooms}
            onRoomSelect={handleRoomSelect}
            onRoomPasswordChange={setRoomPassword}
          />

          {!hasInvite && (
            <form className={styles.codeForm} onSubmit={handleCodeSubmit}>
              <input
                type='text'
                autoComplete='off'
                autoCapitalize='characters'
                spellCheck={false}
                maxLength={ROOM_CODE_LENGTH}
                value={codeEntry}
                onChange={e => setCodeEntry(e.target.value.toUpperCase())}
                placeholder='invite code'
                aria-label='invite code'
              />
              <Button type='submit' disabled={isCheckingCode}>
                {isCheckingCode ? 'Checking…' : 'Use invite'}
              </Button>
            </form>
          )}
        </>
      )}

      <div ref={userSectionRef} className={clsx(rooms.result.length > 0 && roomId === null && styles.hidden)}>
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

        {(mode === 'returning' || !allowNew) && !hasInvite && roomId !== null && (
          <p className={styles.inviteHint}>
            New here? A room is joined by invitation — scan the QR code your
            host is showing, or enter the code they read out to you above.
          </p>
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
