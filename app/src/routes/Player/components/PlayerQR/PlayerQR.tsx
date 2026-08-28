import React, { useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { useAppSelector } from 'store/hooks'
import { CSSTransition } from 'react-transition-group'
import { QRCode } from 'react-qrcode-logo'
import type { QueueItem, IRoomPrefs } from 'shared/types'
import { resolveInviteBaseUrl } from 'shared/inviteUrl'
import { getQRGeometry } from './qrGeometry'
import styles from './PlayerQR.css'

const MIN_STATIC_MS = 10000 // 10 sec
const MAX_STATIC_MS = 180000 // 3 min

interface PlayerQRProps {
  height: number
  prefs: IRoomPrefs['qr']
  queueItem: QueueItem
}

const PlayerQR = ({ height, prefs, queueItem }: PlayerQRProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const maxTimerID = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastToggleTime = useRef<number>(0)
  const [show, setShow] = useState(true)
  const [alternate, setAlternate] = useState(false)
  const { isPlaying } = useAppSelector(state => state.player)
  const { roomId } = useAppSelector(state => state.user)
  const publicUrl = useAppSelector(state => state.prefs.publicUrl ?? '')
  const [inviteCode, setInviteCode] = React.useState<string | null>(null)

  // fetched rather than pushed: the code must not travel in the public room
  // list, so only a client already in the room can ask for it
  React.useEffect(() => {
    if (roomId === null) return

    fetch(`${document.baseURI}api/rooms/${roomId}/code`, { credentials: 'same-origin' })
      .then((res): Promise<{ code: string }> => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data): undefined => {
        setInviteCode(data.code)
        return undefined
      })
      .catch((): undefined => undefined)
  }, [roomId])

  const scheduleNextToggle = useCallback(() => {
    if (maxTimerID.current) {
      clearTimeout(maxTimerID.current)
      maxTimerID.current = null
    }

    // wait for current song to end?
    if (isPlaying) return

    const now = Date.now()
    const timeSinceLastToggle = now - lastToggleTime.current
    const timeUntilMax = Math.max(MAX_STATIC_MS - timeSinceLastToggle, 0)

    maxTimerID.current = setTimeout(() => {
      setShow(false)
    }, timeUntilMax)
  }, [isPlaying])

  useEffect(() => {
    lastToggleTime.current = Date.now()
  }, [])

  useEffect(() => {
    scheduleNextToggle()

    return () => {
      if (maxTimerID.current) clearTimeout(maxTimerID.current)
    }
  }, [scheduleNextToggle])

  useEffect(() => {
    const now = Date.now()
    const timeSinceLastToggle = now - lastToggleTime.current

    if (timeSinceLastToggle > MIN_STATIC_MS) {
      const timeout = setTimeout(() => setShow(false), 0)
      return () => clearTimeout(timeout)
    }
  }, [queueItem?.queueId])

  const handleTransitionEnd = () => {
    if (!show) {
      setAlternate(prev => !prev)
      setShow(true) // trigger enter transition
      lastToggleTime.current = Date.now()

      scheduleNextToggle()
    }
  }

  // Prefer whichever public name this Player was opened at, so a server
  // answering to several domains invites people to the one in use; fall back
  // to the configured URL when it's open at a LAN address, since an invite
  // pointing there is useless to a guest on mobile data.
  const base = resolveInviteBaseUrl(window.location, publicUrl)
  const url = new URL(base, window.location.href)
  url.pathname = url.pathname.replace(/\/player$/, '')
  url.search = ''

  // The invite carries the room's random code, never its numeric id: ids are
  // sequential, so "?roomId=1" advertises that rooms 2, 3, 4… exist — fine on
  // a private LAN, not once this answers from the internet.
  if (inviteCode) {
    url.searchParams.append('room', inviteCode)
  } else {
    url.searchParams.append('roomId', String(roomId))
  }

  if (prefs.password) {
    url.searchParams.append('password', btoa(prefs.password))
  }

  const { size, quietZone } = getQRGeometry(height, prefs.size, url.href)

  return (
    <CSSTransition
      in={show}
      nodeRef={ref}
      classNames={{
        enterActive: styles.enterActive,
        exitActive: styles.exitActive,
      }}
      addEndListener={(done: () => void) => {
        const node = ref.current
        if (!node) return

        const onTransitionEnd = (e: Event) => {
          if (e.target !== node) return // ignore bubbling from children
          node.removeEventListener('transitionend', onTransitionEnd)
          done() // required for react-transition-group
          handleTransitionEnd()
        }

        node.addEventListener('transitionend', onTransitionEnd, false)
      }}
    >
      <div
        className={clsx(styles.container, alternate && styles.alternate)}
        ref={ref}
      >
        {/* the white ends here: everything the symbol needs, and nothing the
            room has to look at */}
        <div className={styles.symbol}>
          <QRCode
            value={url.href}
            ecLevel='M'
            size={size}
            quietZone={quietZone}
            bgColor='#ffffff'
            fgColor='#000000'
            qrStyle='squares'
          />
        </div>

        {/* Shown alongside the QR for anyone who can't scan — a phone with a
            dead camera, or someone reading it out to a guest over the phone.
            The alphabet already excludes O/0 and I/1/L so it survives being
            dictated. It sits on the video rather than inside the white, which
            is what made the whole thing read as a card. */}
        {inviteCode && (
          <div className={styles.code} style={{ fontSize: Math.max(12, Math.round(size * 0.15)) }}>
            {inviteCode}
          </div>
        )}
      </div>
    </CSSTransition>
  )
}

export default PlayerQR
