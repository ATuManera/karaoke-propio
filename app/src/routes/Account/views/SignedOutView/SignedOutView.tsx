import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { createAccount, login } from 'store/modules/user'
import { importRepertoire } from 'store/modules/repertoire'
import Logo from 'components/Logo/Logo'
import InputRadio from 'components/InputRadio/InputRadio'
import Create, { type RepertoireChoice } from './Create/Create'
import SignIn from './SignIn/SignIn'
import Button from 'components/Button/Button'
import { ROOM_CODE_LENGTH, normalizeRoomCode } from 'shared/roomCode'
import LanguagePicker from 'components/LanguagePicker/LanguagePicker'
import Icon from 'components/Icon/Icon'
import { KP_NAME, KP_REPO_URL, KP_VERSION } from 'shared/version'
import { msg, translate, useT } from 'lib/i18n'
import styles from './SignedOutView.css'

/** what an invite code resolves to; the only room this screen ever names */
interface Invite {
  roomId: number
  name: string
  hasPassword: boolean
  allowNewGuest: boolean
  allowNewStandard: boolean
}

/**
 * The way in.
 *
 * Two doors and no more: the code somebody was invited with, or the account
 * they already have. Which room is deliberately not asked here — it used to
 * be, which meant this screen published every room on the installation to
 * anyone who could reach the address, and let a stranger pick one before
 * saying who they were. Rooms belong to accounts now (see migration 018), so
 * the question moves to after the answer that makes it answerable.
 */
const SignedOutView = () => {
  const t = useT()
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  const prefs = useAppSelector(state => state.prefs)
  const ui = useAppSelector(state => state.ui)
  const dispatch = useAppDispatch()

  const [mode, setMode] = useState('returning')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [focusRequest, setFocusRequest] = useState(0)
  const [isModeDefaulted, setIsModeDefaulted] = useState(false)

  // An invite code says nothing about which room it opens, so it has to be
  // resolved server-side; the mapping is deliberately not published anywhere.
  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [codeEntry, setCodeEntry] = useState('')
  const [isCheckingCode, setIsCheckingCode] = useState(false)

  const resolveInvite = useCallback((code: string) => fetch(`${document.baseURI}api/rooms/code/${encodeURIComponent(code)}`, { credentials: 'same-origin' })
    .then((res): Promise<Invite> => res.ok
      ? res.json()
      : Promise.reject(new Error(res.status === 429
          ? translate('signedOut.tooManyAttempts')
          : translate('signedOut.inviteInvalid'))))
    .then((data): undefined => {
      setInvite(data)
      setInviteCode(code)
      setIsCheckingCode(false)

      // a QR can carry the room's password so nobody has to read one out; the
      // room still asks for it when it does not
      const carried = new URLSearchParams(location.search).get('password')

      if (data.hasPassword && carried) setRoomPassword(atob(carried))

      setFocusRequest(r => r + 1)
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
      setInviteError(t('signedOut.codeWrongLength', { count: ROOM_CODE_LENGTH }))
      return
    }

    setInviteError(null)
    setIsCheckingCode(true)
    resolveInvite(code)
  }

  const handleFirstFieldRef = (el: HTMLInputElement | null) => {
    if (el) firstFieldRef.current = el
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()

    dispatch(login({
      username: username.trim(),
      password: password,
      // An invite in hand is passed along even by someone who already has an
      // account: it is what adds that room to theirs, so tomorrow they sign in
      // and land in it without being read a code again. Without one the server
      // reads their rooms off their account.
      roomCode: inviteCode ?? '',
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
    data.append('roomId', String(invite?.roomId ?? ''))
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

      alert(t('signedOut.repertoireImported', { matched: songs.matched, total: songs.total, count: songs.total })
        + (pitches.applied ? t('signedOut.repertoirePitchesSaved', { count: pitches.applied }) : '.'))
    } else {
      alert(t('signedOut.repertoireFailed', { error: imported.error.message }))
    }
  }

  // Making an account is for people who were invited to this room, and the
  // invite is the code they arrived with — checked again server-side, since a
  // hidden radio button has never stopped anyone. Someone who already has an
  // account signs in as before: their password is their invitation.
  const allowNewGuest = !!invite?.allowNewGuest
  const allowNewStandard = !!invite?.allowNewStandard
  const allowNew = allowNewStandard || allowNewGuest

  // Someone who scanned a QR or was read a code came to join a party, and
  // almost never has an account here — so start them on the answer they were
  // going to give. "Returning user" stays one tap away, first in the list.
  //
  // Applied once: after that the choice is theirs, including changing it back.
  if (!isModeDefaulted && allowNew) {
    setIsModeDefaulted(true)
    setMode(allowNewGuest ? 'guest' : 'standard')
  }

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [focusRequest, mode])

  return (
    <div className={styles.container} style={{ maxWidth: Math.max(340, ui.contentWidth * 0.66) }}>
      <Logo className={styles.logo} />

      {/* Which build this is, and where its code lives — beside the wordmark
          because it is part of the identity, and the first thing anyone
          reporting a problem is asked for. */}
      <p className={styles.version}>
        <a
          className={styles.versionLink}
          href={KP_REPO_URL}
          target='_blank'
          rel='noreferrer'
          aria-label={t('about.versionOnGitHub', { name: KP_NAME, version: KP_VERSION })}
        >
          <span translate='no'>{t('about.version', { name: KP_NAME, version: KP_VERSION })}</span>
          <Icon icon='GITHUB_REPO' size={13} className={styles.versionIcon} />
        </a>
      </p>

      {/* Before any account exists there is nowhere else to say it, and a
          guest arriving by QR on an English phone would otherwise have to
          sign in first to be understood. */}
      <LanguagePicker className={styles.language} showHint={false} />

      {/* a bad invite must say so; otherwise nothing on screen changes and the
          guest cannot tell the link was the problem */}
      {inviteError && <p className={styles.inviteError}>{inviteError}</p>}

      {/* The one room this screen ever names, and only to the person holding
          the code that opens it: stated, never offered. */}
      {invite && (
        <div className={styles.invitedTo}>
          <span className={styles.invitedToLabel}>{t('signedOut.invitedTo')}</span>
          <span className={styles.invitedToRoom} translate='no'>{invite.name}</span>
        </div>
      )}

      {invite?.hasPassword && (
        <input
          className={styles.roomPassword}
          type='password'
          autoComplete='off'
          onChange={e => setRoomPassword(e.target.value)}
          placeholder={t('signedOut.roomPasswordRequired')}
          aria-label={t('signedOut.roomPasswordRequired')}
          value={roomPassword}
        />
      )}

      {/* Somewhere to type a code that was read out loud, for as long as one
          has not been used. A scanned QR fills it in through the URL and this
          never appears. */}
      {!invite && (
        <form className={styles.codeForm} onSubmit={handleCodeSubmit}>
          <input
            type='text'
            autoComplete='off'
            autoCapitalize='characters'
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            value={codeEntry}
            onChange={e => setCodeEntry(e.target.value.toUpperCase())}
            placeholder={t('signedOut.inviteCode')}
            aria-label={t('signedOut.inviteCode')}
          />
          {/* variant matters: without one a Button renders as bare
              transparent text, which beside a filled input read as a broken
              overlap rather than as something to press */}
          <Button type='submit' variant='default' disabled={isCheckingCode}>
            {isCheckingCode ? t('signedOut.checking') : t('signedOut.useInvite')}
          </Button>
        </form>
      )}

      <div>
        {allowNew
          ? (
              <>
                <h1>{t('signedOut.joinAs')}</h1>
                <div className={styles.radioContainer}>
                  <InputRadio name='type' value='returning' checked={mode === 'returning'} onChange={setMode} label={t('signedOut.returningUser')} />
                  {allowNewStandard && <InputRadio name='type' value='standard' checked={mode === 'standard'} onChange={setMode} label={t('signedOut.newUser')} />}
                  {allowNewGuest && <InputRadio name='type' value='guest' checked={mode === 'guest'} onChange={setMode} label={t('signedOut.guest')} />}
                </div>
              </>
            )
          : <h1>{t('signedOut.signInShort')}</h1>}

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

        {(mode === 'returning' || !allowNew) && !invite && (
          <p className={styles.inviteHint}>{t('signedOut.inviteHint')}</p>
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

      {/* Credit for the base the app is built on. At the foot rather than
          under the wordmark: it is an acknowledgement, and the screen above
          it is the one people came here to use. */}
      <p className={styles.builtOn}>
        <Trans
          i18nKey={msg('signedOut.builtOn')}
          components={{
            a: <a href='https://www.karaoke-eternal.com' target='_blank' rel='noreferrer' />,
          }}
        />
      </p>
    </div>
  )
}

export default SignedOutView
