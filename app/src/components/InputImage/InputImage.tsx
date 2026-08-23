import React, { useState, useEffect } from 'react'
import Button from 'components/Button/Button'
import Icon from 'components/Icon/Icon'
import loadImage from 'blueimp-load-image'
import { useT } from 'lib/i18n'
import { User } from 'shared/types'
import styles from './InputImage.css'

interface UserImageProps {
  user?: User
  onSelect: (blob: Blob) => void
}

const InputImage = ({ user, onSelect }: UserImageProps) => {
  const t = useT()
  const cameraInput = React.useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [imageURL, setImageURL] = useState<string | null>(
    user && user.userId !== null
      ? `${document.baseURI}api/user/${user.userId}/image?v=${user.dateUpdated}`
      : null,
  )

  useEffect(() => {
    return () => {
      if (imageURL) {
        URL.revokeObjectURL(imageURL)
      }
    }
  }, [imageURL])

  const handleImgLoad = () => {
    setIsLoading(false)
  }

  const handleImgError = () => {
    setImageURL(null)
    setIsLoading(false)
  }

  const handleImgClear = () => {
    setImageURL(null)
    onSelect(null)
  }

  const handleChoose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    loadImage(
      file,
      (canvas) => {
        if (canvas instanceof Event) {
          alert(t('account.form.imageFailed'))
          return
        }

        const scaled = loadImage.scale(canvas, {
          canvas: true,
          maxWidth: 400,
          maxHeight: 300,
          crop: true,
          downsamplingRatio: 0.5,
        })

        scaled.toBlob((blob: Blob) => {
          if (blob) {
            setImageURL(URL.createObjectURL(blob))
            onSelect(blob)
          }
        }, 'image/jpeg')
      },
      {
        canvas: true,
        aspectRatio: 4 / 3,
        orientation: true,
      },
    )
  }

  return (
    <div className={styles.container}>
      {!imageURL && (
        <Icon icon='PHOTO_ADD' size={48} className={styles.placeholder} />
      )}

      {imageURL && (
        <img
          src={imageURL}
          width={96}
          height={72}
          onLoad={handleImgLoad}
          onError={handleImgError}
          alt={t('account.form.userProfile')}
        />
      )}

      {imageURL && !isLoading && (
        <Button
          className={styles.btnClear}
          icon='CLEAR'
          onClick={handleImgClear}
          size={32}
        />
      )}

      {/* Taking a selfie is the normal way to set a profile picture on a
          phone, but a bare file input only opens the photo library on most
          devices — the camera needs `capture` to be offered at all. Kept as a
          separate control so choosing an existing photo still works: putting
          `capture` on the main input would replace the library with the
          camera rather than adding to it. */}
      <Button
        className={styles.btnCamera}
        icon='CAMERA'
        size={32}
        onClick={() => cameraInput.current?.click()}
        aria-label={t('account.form.takeAPhoto')}
        title={t('account.form.takeAPhoto')}
      />

      <input
        ref={cameraInput}
        type='file'
        accept='image/*'
        capture='user'
        onChange={handleChoose}
        className={styles.hiddenInput}
      />

      <input
        type='file'
        accept='image/*'
        onChange={handleChoose}
        className={styles.fileInput}
        ref={(node) => {
          if (!node) return

          // prevents cancel event from bubbling up and dismissing a <dialog>
          node.addEventListener('cancel', (e) => {
            e.stopPropagation()
          })
        }}
      />
    </div>
  )
}

export default InputImage
