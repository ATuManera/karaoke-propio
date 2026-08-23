import React, { useState } from 'react'
import clsx from 'clsx'
import Panel from 'components/Panel/Panel'
import Icon from 'components/Icon/Icon'
import Logo from 'components/Logo/Logo'
import Modal from 'components/Modal/Modal'
import Button from 'components/Button/Button'
// @ts-expect-error: not worth configuring TS for this one weird import
import html from '<PROJECT_ROOT>/CHANGELOG.md'
import styles from './About.css'
import { useT } from 'lib/i18n'
import { KP_NAME, KP_REPO_URL, KP_VERSION } from 'shared/version'

const curYear = new Date().getFullYear()

const About = () => {
  const t = useT()
  const [isChangelogOpen, setChangelogOpen] = useState(false)
  const toggleChangelog = () => setChangelogOpen(prevState => !prevState)

  return (
    <Panel title={t('about.title')} contentClassName={styles.content}>
      <>
        {/* the wordmark leads to this fork's own code, not upstream's:
            everything named on this screen above the divider is this project */}
        <a href={KP_REPO_URL} target='_blank' rel='noreferrer' aria-label={t('about.versionOnGitHub', { name: KP_NAME, version: KP_VERSION })}>
          <Logo className={styles.logo} />
        </a>

        {/*
          * Which version is installed, and where the code for it lives.
          *
          * It used to read "v0.0.0-dev.0": the number came from package.json,
          * which is upstream Karaoke Eternal's and stays at its placeholder.
          * A version nobody can act on is worse than none — this is the first
          * thing anyone reporting a problem is asked for.
          *
          * Underlined rather than distinguished by colour alone, and given an
          * accessible label, because "v2.1.0" read aloud says nothing about
          * where the link goes.
          */}
        <p className={styles.version}>
          <a
            className={styles.versionLink}
            href={KP_REPO_URL}
            target='_blank'
            rel='noreferrer'
            aria-label={t('about.versionOnGitHub', { name: KP_NAME, version: KP_VERSION })}
          >
            <span translate='no'>{t('about.version', { name: KP_NAME, version: KP_VERSION })}</span>
            <Icon icon='GITHUB_REPO' size={14} className={styles.versionIcon} />
          </a>
        </p>

        <div className={styles.ghButtonContainer}>
          <div className={styles.ghButton}>
            <a href={KP_REPO_URL} target='_blank' rel='noreferrer'>
              <Icon icon='GITHUB_REPO' size={16} />
              GitHub
            </a>
          </div>
          <div className={clsx(styles.ghButton, styles.star)}>
            <a href={KP_REPO_URL} target='_blank' rel='noreferrer'>
              <Icon icon='GITHUB_STAR' size={16} />
              {t('about.star')}
            </a>
          </div>
        </div>

        <p className={styles.links}>
          <a href='/licenses.txt' target='_blank'>{t('about.licenses')}</a>
        </p>

        {/*
          * Below the rule, nothing is this project's. Separating them is the
          * whole point: the two differ by enough that a reader who cannot
          * tell which one they are running ends up in the wrong changelog,
          * the wrong documentation and the wrong issue tracker — while the
          * work this is built on still has to be credited, and is.
          */}
        <hr className={styles.divider} />

        <p className={styles.sm}>
          {/* @ts-expect-error: global via Webpack */}
          <a href={__KE_URL_HOME__} target='_blank' rel='noreferrer'>{t('about.builtOn')}</a>
          <br />
          &copy;
          {`2019-${curYear}`}
          {' '}
          <a href='https://www.radroot.com' target='_blank' rel='noreferrer'>RadRoot LLC</a>
        </p>

        <div className={styles.ghButtonContainer}>
          <div className={styles.ghButton}>
            {/* opens a panel, not GitHub, so it does not wear GitHub's mark */}
            <a className={styles.pseudolink} onClick={toggleChangelog}>
              <Icon icon='INFO_OUTLINE' size={16} />
              {t('about.upstreamChangelog')}
            </a>
          </div>
          <div className={clsx(styles.ghButton, styles.sponsor)}>
            {/* @ts-expect-error: global via Webpack */}
            <a href={__KE_URL_SPONSOR__} target='_blank' rel='noreferrer'>
              <Icon icon='GITHUB_SPONSOR' size={16} />
              {t('about.sponsor')}
            </a>
          </div>
        </div>

        {isChangelogOpen && (
          <Modal
            title={t('about.changelogAndSponsors')}
            className={styles.changelog}
            onClose={toggleChangelog}
            scrollable
            buttons={(
              <Button variant='primary' onClick={toggleChangelog}>
                {t('common.done')}
              </Button>
            )}
          >
            {/* @todo: without this anchor the changelog gets scrolled to
              the first "real" link, even with focusTrapped=false */}
            <a href='' aria-hidden></a>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </Modal>
        )}
      </>
    </Panel>
  )
}

export default About
