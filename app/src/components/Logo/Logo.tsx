import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { KP_NAME } from 'shared/version'
import styles from './Logo.css'

interface LogoProps {
  className?: string
}

/**
 * The wordmark.
 *
 * It reads Karaoke Propio, not Karaoke Eternal, and that is deliberate. The
 * ISC licence this fork inherits requires the copyright and licence notices
 * to be kept — they are, in app/LICENSE, NOTICE and THIRD_PARTY_NOTICES.md —
 * but it grants no right to the upstream project's name, and no permissive
 * licence does. Running under someone else's mark would also contradict what
 * the README says out loud: that this is not an official Karaoke Eternal
 * release and is not endorsed by its authors.
 *
 * The practical reason is the same as the legal one. The two projects differ
 * by a great deal — acquisition, per-singer pitch, photos, invitations — so a
 * screen announcing Karaoke Eternal sends people to documentation that does
 * not describe what they are looking at and to an issue tracker that is not
 * the right one. Credit for the base belongs on the About panel and in the
 * notices, which is where it is.
 */
const Logo = (props: LogoProps) => {
  const [isFontLoaded, setIsFontLoaded] = useState(() => {
    // if the font loading API is not supported, we can't wait for it
    return typeof document !== 'undefined' && !document.fonts
  })

  useEffect(() => {
    if (document.fonts) {
      document.fonts.load('1em Beon')
        .then(() => {
          setIsFontLoaded(true)
          return true
        })
        .catch(() => {
          setIsFontLoaded(true)
          return false
        })
    }
  }, [])

  return (
    <div className={clsx(styles.container, props.className)} role='img' aria-label={KP_NAME}>
      <span className={styles.title} aria-hidden='true'>
        Karaoke
        {/* The last letter drops the tracking, or the box sits off-centre
            against the space that follows the final character. */}
        <span className={clsx(styles.badge, { [styles.badgeVisible]: isFontLoaded })}>
          Propi
          <span className={styles.lastChar}>o</span>
        </span>
      </span>
    </div>
  )
}

export default Logo
