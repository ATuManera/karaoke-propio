import React, { useEffect, useRef, useState } from 'react'
import { useAppSelector } from 'store/hooks'
import { buildInviteUrl } from 'shared/inviteUrl'
import { KP_NAME } from 'shared/version'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import { canCopy, canShare, copyToClipboard, shareOrCopy } from 'lib/share'
import styles from './RoomInvite.css'
import { useT } from 'lib/i18n'

/** how long "Copied" stays up: long enough to be read, short enough not to lie */
const FEEDBACK_MS = 2500

/**
 * How someone in a room asks another person into it.
 *
 * A room is joined by invitation, so whoever is hosting needs the code in
 * hand: the Player's QR is on the television, which is no use for asking
 * someone who is not in the house yet, and may be switched off entirely.
 *
 * Two ways out, because they are asked for at different moments. Copy is for
 * a link going somewhere this app cannot reach — a note, an email being
 * written on the laptop. Share hands the invitation straight to WhatsApp,
 * which is where it actually goes, and is the one route that does not require
 * the host to leave the page and find a paste target.
 *
 * Guests are left out. They were invited themselves; passing the invitation
 * on is the host's to do.
 */
const RoomInvite = () => {
  const t = useT()
  const { isGuest, roomId } = useAppSelector(state => state.user)
  const publicUrl = useAppSelector(state => state.prefs.publicUrl ?? '')
  const [code, setCode] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'copied' | null>(null)
  const linkRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // a panel unmounted while "Copied" is still showing must not come back to
  // set state on nothing
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  if (isGuest || typeof roomId !== 'number' || !code) return null

  // same reasoning as the Player's QR: never the numeric roomId, and never a
  // LAN address when a public one has been configured
  const inviteUrl = buildInviteUrl(window.location, publicUrl, code)

  const announceCopied = () => {
    setFeedback('copied')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }

  const handleCopy = () => {
    // selected as well as copied: it shows what went to the clipboard, and it
    // leaves the link ready to copy by hand if the clipboard call is refused
    linkRef.current?.select()

    void copyToClipboard(inviteUrl).then((ok): undefined => {
      if (ok) announceCopied()
      return undefined
    })
  }

  // The room's name is deliberately not in here. This message is read by
  // someone who is not in the room yet, on a phone that may show a preview of
  // it to anyone standing nearby, and the invite link is a credential.
  const handleShare = () => {
    void shareOrCopy({
      title: KP_NAME,
      text: t('rooms.invite.shareText'),
      url: inviteUrl,
    }).then((outcome): undefined => {
      // 'shared' needs nothing said — the share sheet was the feedback — and
      // 'dismissed' still less. Only the quiet fallback has to announce itself.
      if (outcome === 'copied') announceCopied()
      return undefined
    })
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
            value={inviteUrl}
            ref={linkRef}
            onFocus={e => e.target.select()}
            aria-label={t('rooms.invite.linkLabel')}
          />

          {canCopy() && (
            <Button
              variant='quiet'
              className={styles.action}
              onClick={handleCopy}
              icon={feedback === 'copied' ? 'CHECK' : 'COPY'}
              size={22}
              title={feedback === 'copied' ? t('common.copied') : t('common.copy')}
              aria-label={t('common.copy')}
            />
          )}

          {/* Only where the platform has a share sheet. A share button that
              silently copies instead is a button that did not do what its
              icon says, and Copy is right there. */}
          {canShare() && (
            <Button
              variant='quiet'
              className={styles.action}
              onClick={handleShare}
              icon='SHARE'
              size={22}
              title={t('rooms.invite.share')}
              aria-label={t('rooms.invite.share')}
            />
          )}
        </div>

        {/* Spoken by a screen reader when it changes, and kept in the layout
            at all times so the panel does not jump when it appears. */}
        <p className={styles.feedback} role='status'>
          {feedback === 'copied' ? t('common.copied') : ''}
        </p>
      </>
    </Panel>
  )
}

export default RoomInvite
