import React, { useId, useState } from 'react'
import clsx from 'clsx'
import Icon from 'components/Icon/Icon'
import styles from './Panel.css'

interface PanelProps {
  children: React.ReactElement
  className?: string
  /**
   * Let the title fold the panel away.
   *
   * For the panels whose length is not theirs to control: a singer with sixty
   * saved pitches, an installation with six rooms. Everything else stays open,
   * because a panel that is short is not worth a tap to see.
   */
  collapsible?: boolean
  contentClassName?: string
  /** only meaningful with `collapsible`; open on first render, then it follows the taps */
  initialExpanded?: boolean
  /**
   * Said in the title, so a folded panel still reports what it is holding — a
   * count, a filter. Kept out of the toggle for a collapsible panel: a select
   * inside a button is not a control anyone can use.
   */
  title: string
  titleComponent?: React.ReactElement
}

const Panel = ({
  children,
  className,
  collapsible = false,
  contentClassName,
  initialExpanded = false,
  title,
  titleComponent,
}: PanelProps) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const id = useId()

  // Not collapsible: unchanged markup, so nothing that never asked for this
  // gains a button, an aria-expanded or a chevron.
  if (!collapsible) {
    return (
      <div className={clsx(styles.container, className)}>
        <div className={styles.titleContainer}>
          <h1>{title}</h1>
          {titleComponent}
        </div>
        <div className={clsx(styles.content, contentClassName)}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, className)} {...(isExpanded && { 'data-expanded': '' })}>
      <div className={styles.titleContainer}>
        {/* The heading is the control, the way Accordion does it: the button
            carries the state so a screen reader announces "collapsed" on the
            thing whose name it just read, instead of on an unlabelled row. */}
        <h1 className={styles.collapsibleHeading}>
          <button
            type='button'
            className={styles.toggle}
            id={`panel-header-${id}`}
            aria-controls={`panel-content-${id}`}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Icon icon='CHEVRON_RIGHT' size={20} className={styles.chevron} />
            {title}
          </button>
        </h1>
        {titleComponent}
      </div>
      <div
        id={`panel-content-${id}`}
        aria-labelledby={`panel-header-${id}`}
        className={clsx(styles.content, contentClassName)}
        hidden={!isExpanded}
      >
        {children}
      </div>
    </div>
  )
}

export default Panel
