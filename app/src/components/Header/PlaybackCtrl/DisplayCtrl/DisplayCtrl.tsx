import React from 'react'
import clsx from 'clsx'
import { useT } from 'lib/i18n'
import Modal, { ModalProps } from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Slider from 'components/Slider/Slider'
import Icon from 'components/Icon/Icon'
import styles from './DisplayCtrl.css'
import { MediaType, PlaybackOptions } from 'shared/types'

interface DisplayCtrlProps {
  cdgAlpha: number
  cdgSize: number
  isVideoKeyingEnabled: boolean
  isVisualizerEnabled: boolean
  isWebGLSupported: boolean
  mediaType?: MediaType
  mp4Alpha: number
  sensitivity: number
  visualizerPresetName: string
  // actions
  onRequestOptions(opts: PlaybackOptions): void
  onClose: ModalProps['onClose']
}

const DisplayCtrl = ({
  cdgAlpha,
  cdgSize,
  isVideoKeyingEnabled,
  isVisualizerEnabled,
  isWebGLSupported,
  mediaType = '',
  mp4Alpha,
  sensitivity,
  visualizerPresetName,
  onRequestOptions,
  onClose,
}: DisplayCtrlProps) => {
  const t = useT()

  const handleAlpha = (val: number) => {
    if (mediaType === '') return
    onRequestOptions({ [mediaType + 'Alpha']: val })
  }

  const handleSensitivity = (val: number) => onRequestOptions({
    visualizer: { sensitivity: val },
  })

  const handleSize = (val: number) => {
    onRequestOptions({ cdgSize: val })
  }

  const handleToggleVisualizer = () => onRequestOptions({
    visualizer: { isEnabled: !isVisualizerEnabled },
  })

  const handlePresetNext = () => onRequestOptions({
    visualizer: { nextPreset: true },
  })

  const handlePresetPrev = () => onRequestOptions({
    visualizer: { prevPreset: true },
  })

  const handlePresetRandom = () => onRequestOptions({
    visualizer: { randomPreset: true },
  })

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={t('display.title')}
      buttons={<Button variant='primary' onClick={onClose}>{t('common.done')}</Button>}
    >
      <div className={styles.container}>
        <div className={clsx(styles.section, styles.visualizer)}>
          <fieldset>
            <legend>
              <InputCheckbox
                label={t('display.visualizer')}
                checked={isVisualizerEnabled}
                disabled={!isWebGLSupported}
                onChange={handleToggleVisualizer}
              />
            </legend>

            {isWebGLSupported && (mediaType === 'cdg' || isVideoKeyingEnabled) && (
              <>
                <div className={styles.presetContainer}>
                  <div className={styles.presetButtons}>
                    <Button
                      onClick={handlePresetPrev}
                      aria-label={t('display.previousPreset')}
                      aria-controls='visualizer-preset-name'
                    >
                      <Icon icon='CHEVRON_LEFT' />
                    </Button>
                    <Button
                      onClick={handlePresetRandom}
                      aria-label={t('display.randomPreset')}
                      aria-controls='visualizer-preset-name'
                    >
                      <Icon icon='DICE' />
                    </Button>
                    <Button
                      onClick={handlePresetNext}
                      aria-label={t('display.nextPreset')}
                      aria-controls='visualizer-preset-name'
                    >
                      <Icon icon='CHEVRON_RIGHT' />
                    </Button>
                  </div>
                  <p
                    id='visualizer-preset-name'
                    className={styles.presetName}
                    aria-live='polite'
                    translate='no'
                  >
                    {visualizerPresetName}
                  </p>
                </div>

                <div className={styles.field}>
                  <label id='label-visualizer-sensitivity'>{t('display.sensitivity')}</label>
                  <Slider
                    min={0}
                    max={2}
                    step={0.01}
                    value={sensitivity}
                    onChange={handleSensitivity}
                    className={styles.slider}
                    aria-labelledby='label-visualizer-sensitivity'
                  />
                </div>
              </>
            )}

            {isWebGLSupported && mediaType !== 'cdg' && !isVideoKeyingEnabled
              && <p className={styles.unsupported}>{t('display.notAvailableForMediaType')}</p>}

            {!isWebGLSupported
              && <p className={styles.unsupported}>{t('display.webGLNotSupported')}</p>}
          </fieldset>
        </div>

        <div className={clsx(styles.section, styles.lyrics)}>
          <fieldset>
            <legend>
              <label>{t('display.lyrics')}</label>
            </legend>

            {mediaType === 'cdg' && (
              <div className={styles.field}>
                <label id='label-lyrics-size'>{t('display.size')}</label>
                <Slider
                  min={0.4}
                  max={0.9}
                  step={0.01}
                  value={cdgSize}
                  onChange={handleSize}
                  className={styles.slider}
                  aria-labelledby='label-lyrics-size'
                />
              </div>
            )}

            {(mediaType === 'cdg' || isVideoKeyingEnabled) && (
              <div className={styles.field}>
                <label id='label-lyrics-background'>{t('display.background')}</label>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={mediaType === 'cdg' ? cdgAlpha : mp4Alpha}
                  onChange={handleAlpha}
                  className={styles.slider}
                  aria-labelledby='label-lyrics-background'
                />
              </div>
            )}

            {mediaType !== 'cdg' && !isVideoKeyingEnabled && (
              <p className={styles.unsupported}>{t('display.noOptions')}</p>
            )}
          </fieldset>
        </div>
      </div>
    </Modal>
  )
}

export default DisplayCtrl
