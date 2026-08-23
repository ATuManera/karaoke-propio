import React from 'react'
import Modal from 'components/Modal/Modal'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Button from 'components/Button/Button'
import styles from './PathInfo.css'
import type { Path } from 'shared/types'
import { useT } from 'lib/i18n'

interface PathInfoProps {
  onClose: () => void
  onRemove: (pathId: number) => void
  onUpdate: (pathId: number, data: object) => void
  path: Path
}

const PathInfo = ({ onClose, onRemove, onUpdate, path }: PathInfoProps) => {
  const t = useT()
  const handleChange = (data: Record<string, boolean>) => {
    onUpdate(path.pathId, data)
  }

  const handleRemove = () => onRemove(path.pathId)

  return (
    <Modal
      onClose={onClose}
      title={t('prefs.mediaFolder')}
      buttons={(
        <>
          <Button onClick={handleRemove} variant='danger'>{t('prefs.removeFolder')}</Button>
          <Button onClick={onClose} variant='primary'>{t('common.done')}</Button>
        </>
      )}
    >
      <div>
        <p className={styles.path}>
          {path?.path}
          <br />
          <span className={styles.label}>pathId: </span>
          {path?.pathId}
        </p>

        <form className={styles.form}>
          <InputCheckbox
            label={t('prefs.watchFolder')}
            defaultChecked={path?.prefs?.isWatchingEnabled}
            onChange={event => handleChange({ isWatchingEnabled: event.currentTarget.checked })}
          />
          <InputCheckbox
            label={t('prefs.allowVideoKeying')}
            defaultChecked={path?.prefs?.isVideoKeyingEnabled}
            onChange={event => handleChange({ isVideoKeyingEnabled: event.currentTarget.checked })}
          />
        </form>
      </div>
    </Modal>
  )
}

export default PathInfo
