import React, { useEffect, useRef, useState } from 'react'
import { useAppSelector } from 'store/hooks'
import { resolveInviteBaseUrl } from 'shared/inviteUrl'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import styles from './RoomInvite.css'
import { useT } from 'lib/i18n'

/**
 * How someone in a room asks another person into it.
 *
 * A room is joined by invitation, so whoever is hosting needs the code in
 * hand: the Player's QR is on the television, which is no use for asking
 * someone who is not in the house yet, and may be switched off entirely.
 *
 * Guests are left out. They were invited themselves; passing the invitation
 * on is the host's to do.
 */
const RoomInvite = () => {
  const t = useT()
  const { isGuest, roomId } = useAppSelector(state => state.user)
  const publicUrl = useAppSelector(state => state.prefs.publicUrl ?? '')
  const [code, setCode] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const linkRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isGuest || typeof roomId !== 'number') return

    fetch(`${document.baseURI}api/rooms/${roomId}/code`, { credentials: 'same-origin' })
      .then((res): Promise<{ code: string }> => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data): undefined => {
        setCode(data.code)
        return undefined
      })
      .catch((): undefined => undefined)
  }, [isGuest, roomId])

  if (isGuest || typeof roomId !== 'number' || !code) return null

  // same reasoning as the Player's QR: never the numeric roomId, and never a
  // LAN address when a public one has been configured
  const url = new URL(resolveInviteBaseUrl(window.location, publicUrl))
  url.searchParams.set('room', code)

  const handleCopy = () => {
    linkRef.current?.select()

    navigator.clipboard?.writeText(url.href)
      .then((): undefined => {
        setIsCopied(true)
        return undefined
      })
      .catch((): undefined => undefined)
  }

  return (
    <Panel title={t('rooms.invite.title')}>
      <>
        <p className={styles.hint}>
          {t('rooms.invite.hint')}
        </p>

        <div className={styles.code} translate='no'>{code}</div>

        <div className={styles.linkRow}>
          <input
            type='text'
            readOnly
            value={url.href}
            ref={linkRef}
            onFocus={e => e.target.select()}
            aria-label={t('rooms.invite.linkLabel')}
          />
          {typeof navigator.clipboard !== 'undefined' && (
            <Button onClick={handleCopy}>
              {isCopied ? t('common.copied') : t('common.copy')}
            </Button>
          )}
        </div>
      </>
    </Panel>
  )
}

export default RoomInvite
