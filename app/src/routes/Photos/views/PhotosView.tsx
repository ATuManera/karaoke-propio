import React, { useCallback, useEffect, useRef, useState } from 'react'
import loadImage from 'blueimp-load-image'
import { useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import Icon from 'components/Icon/Icon'
import Spinner from 'components/Spinner/Spinner'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import styles from './PhotosView.css'
import { translate, useT } from 'lib/i18n'

interface Photo {
  photoId: number
  userId: number | null
  userDisplayName: string | null
  bytes: number
  width: number | null
  height: number | null
  dateCreated: number
  originalName: string | null
}

// Phone cameras produce 4-12MB files; sending those raw over a party wifi is
// slow enough that people give up. Resizing in the browser first keeps uploads
// quick and avoids needing an image library on the server.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

const PhotosView = () => {
  const t = useT()
  const { userId, isAdmin, roomId } = useAppSelector(state => state.user)
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
  const [viewing, setViewing] = useState<Photo | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`${document.baseURI}api/photos`, { credentials: 'same-origin' })
      .then((res): Promise<{ photos: Photo[] }> => res.ok ? res.json() : Promise.reject(new Error(translate('photos.couldNotLoad'))))
      .then((data): undefined => {
        setPhotos(data.photos)
        return undefined
      })
      .catch((err: Error): undefined => {
        setError(err.message)
        return undefined
      })
  }, [])

  useEffect(() => {
    if (roomId !== null) load()
  }, [load, roomId])

  const uploadOne = (file: File) => new Promise<void>((resolve) => {
    loadImage(file, (canvas) => {
      if (canvas instanceof Event || !(canvas instanceof HTMLCanvasElement)) {
        resolve()
        return
      }

      const scaled = loadImage.scale(canvas, { canvas: true, maxWidth: MAX_DIMENSION, maxHeight: MAX_DIMENSION })

      scaled.toBlob((blob: Blob | null) => {
        if (!blob) {
          resolve()
          return
        }

        const form = new FormData()
        form.append('photo', blob, file.name.replace(/\.[^.]+$/, '') + '.jpg')
        form.append('width', String(scaled.width))
        form.append('height', String(scaled.height))

        fetch(`${document.baseURI}api/photos`, { method: 'POST', body: form, credentials: 'same-origin' })
          .then((res): undefined => {
            if (!res.ok) setError(t('photos.uploadFailed'))
            resolve()
            return undefined
          })
          .catch((): undefined => {
            setError(t('photos.uploadFailed'))
            resolve()
            return undefined
          })
      }, 'image/jpeg', JPEG_QUALITY)
    }, { canvas: true, orientation: true }) // orientation: phones store photos rotated
  })

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // let the same file be picked again
    if (!files.length) return

    setError(null)
    setUploading(files.length)

    // sequential: a phone uploading ten photos at once on party wifi just
    // makes them all slow, and progress becomes meaningless
    for (const file of files) {
      await uploadOne(file)
      setUploading(n => n - 1)
    }

    load()
  }

  const handleDelete = (photo: Photo) => {
    if (!window.confirm(t('photos.confirmDelete'))) return

    fetch(`${document.baseURI}api/photos/${photo.photoId}`, { method: 'DELETE', credentials: 'same-origin' })
      .then((): undefined => {
        setViewing(null)
        load()
        return undefined
      })
      .catch((): undefined => undefined)
  }

  if (roomId === null) {
    return (
      <TextOverlay>
        <h1>{t('photos.getARoom')}</h1>
        <p>{t('photos.signInToShare')}</p>
      </TextOverlay>
    )
  }

  const canDelete = (photo: Photo) => isAdmin || photo.userId === userId

  return (
    <div className={styles.container}>
      <div className={styles.actions}>
        {/* size is required: without it the icon scales to whatever the button
            is given, and a stretched toolbar button turned the camera glyph
            into a full-screen image on desktop */}
        <Button variant='primary' icon='CAMERA' size={20} onClick={() => cameraRef.current?.click()}>
          {t('photos.takePhoto')}
        </Button>
        <Button icon='PHOTO_ADD' size={20} onClick={() => galleryRef.current?.click()}>
          {t('photos.upload')}
        </Button>
        <span className={styles.count}>
          {photos?.length ? t('photos.count', { count: photos.length }) : ''}
        </span>
      </div>

      {/* capture opens the camera directly; without it phones only offer the
          gallery. Kept as two inputs so both routes stay available. */}
      <input ref={cameraRef} type='file' accept='image/*' capture='environment' onChange={handleFiles} className={styles.hidden} />
      <input ref={galleryRef} type='file' accept='image/*' multiple onChange={handleFiles} className={styles.hidden} />

      {!!uploading && (
        <div className={styles.status}>
          <Spinner />
          <span>
            Uploading
            {' '}
            {uploading}
            {' '}
            photo(s)…
          </span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {photos === null && !error && <Spinner />}

      {photos?.length === 0 && (
        <TextOverlay>
          <h1>{t('photos.none')}</h1>
          <p>{t('photos.takeTheFirst')}</p>
        </TextOverlay>
      )}

      <div className={styles.grid}>
        {photos?.map(photo => (
          <button
            key={photo.photoId}
            type='button'
            className={styles.thumb}
            onClick={() => setViewing(photo)}
            aria-label={t('photos.photoBy', { name: photo.userDisplayName ?? t('photos.someone') })}
          >
            <img src={`${document.baseURI}api/photos/${photo.photoId}`} loading='lazy' alt='' />
          </button>
        ))}
      </div>

      {viewing && (
        <div className={styles.viewer} onClick={() => setViewing(null)}>
          <img
            src={`${document.baseURI}api/photos/${viewing.photoId}`}
            alt=''
            onClick={e => e.stopPropagation()}
          />

          <div className={styles.viewerBar} onClick={e => e.stopPropagation()}>
            <span className={styles.credit}>{viewing.userDisplayName ?? ''}</span>

            <a
              className={styles.viewerBtn}
              href={`${document.baseURI}api/photos/${viewing.photoId}?download`}
              download
            >
              <Icon icon='DOWNLOAD' size={28} />
            </a>

            {canDelete(viewing) && (
              <button type='button' className={styles.viewerBtn} onClick={() => handleDelete(viewing)}>
                <Icon icon='DELETE' size={28} />
              </button>
            )}

            <button type='button' className={styles.viewerBtn} onClick={() => setViewing(null)}>
              <Icon icon='CLEAR' size={28} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PhotosView
