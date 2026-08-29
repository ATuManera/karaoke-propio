import React, { useRef, useState } from 'react'
import { useT } from 'lib/i18n'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import { addSongCategory, removeSongCategory, type CategoryType } from 'store/modules/categories'
import { categoryFromLabel, categoryLabel } from 'lib/categoryLabel'
import styles from './SongInfo.css'

const TYPES: CategoryType[] = ['genre', 'decade', 'voice', 'language']

/**
 * Manual category edits for one song.
 *
 * Anything added here is stored as `manual`, which a later automatic scan
 * leaves alone — an online lookup guesses, a person knows, and a re-scan must
 * not undo the correction.
 */
const SongCategories = ({ songId }: { songId: number }) => {
  const t = useT()
  const dispatch = useAppDispatch()
  const { entities, songCategories } = useAppSelector(state => state.categories)
  const mine = songCategories[songId] ?? []

  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('genre')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savingRef = useRef(false)

  // suggest what the library already uses, so typing "balada" doesn't create a
  // near-duplicate of an existing "Ballad" — and suggest it in the reader's
  // language, since that is how the very same names are written on the chips
  // an inch above. The list used to offer the stored names raw, so a Spanish
  // reader chose from a menu of English while everything around it was in
  // Spanish.
  //
  // Computed on every render rather than memoized: the labels depend on the
  // language too, and a useMemo keyed on the categories alone would keep
  // yesterday's language after a switch. It is a few dozen strings.
  const byLabel = new Map<string, string>()

  for (const category of Object.values(entities)) {
    if (category.type !== type) continue
    byLabel.set(categoryLabel(category.type, category.name), category.name)
  }

  const suggestions = [...byLabel]
    .map(([label, stored]) => ({ label, stored }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const handleAdd = async () => {
    if (!name.trim() || savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    setSaveError(null)

    // Send the stored name, not the translated one. Genre, voice and language
    // are a closed vocabulary shared with the reference table that ships with
    // the app, so a Spanish reader picking "Balada" has to land on the
    // existing "Ballad" rather than open a second genre beside it. Anything
    // not on the list is something they typed, and goes as typed.
    const stored = categoryFromLabel(type, name, suggestions.map(s => s.stored))

    try {
      await dispatch(addSongCategory({ songId, name: stored, type })).unwrap()
      setName('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.categoriesBlock}>
      <span className={styles.label}>{t('categories.label')}</span>

      <div className={styles.chips}>
        {mine.length === 0 && <span className={styles.noneYet}>{t('categories.noneYet')}</span>}
        {mine.map(categoryId => entities[categoryId] && (
          <span key={categoryId} className={styles.chip}>
            {categoryLabel(entities[categoryId].type, entities[categoryId].name)}
            <a
              className={styles.chipRemove}
              title={t('common.remove')}
              onClick={() => dispatch(removeSongCategory({ songId, categoryId }))}
            >
              ×
            </a>
          </span>
        ))}
      </div>

      <div className={styles.addRow}>
        <select className={styles.typeSelect} value={type} onChange={e => setType(e.target.value as CategoryType)}>
          {TYPES.map(type => <option key={type} value={type}>{t(`categories.type.${type}`)}</option>)}
        </select>
        <input
          type='text'
          className={styles.categoryInput}
          list={`category-suggestions-${songId}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaveError(null)
          }}
          // keyup happens after a datalist has committed its highlighted value;
          // keydown used the value from before the selection.
          onKeyUp={(e) => { if (e.key === 'Enter') void handleAdd() }}
          disabled={isSaving}
          placeholder={t('categories.placeholder')}
        />
        <datalist id={`category-suggestions-${songId}`}>
          {suggestions.map(s => <option key={s.stored} value={s.label} />)}
        </datalist>
        <Button onClick={() => { void handleAdd() }} disabled={!name.trim() || isSaving}>
          {isSaving ? t('common.saving') : t('common.add')}
        </Button>
      </div>
      {saveError && <p className={styles.categoryError}>{saveError}</p>}
    </div>
  )
}

export default SongCategories
