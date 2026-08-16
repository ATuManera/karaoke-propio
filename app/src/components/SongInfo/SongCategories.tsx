import React, { useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import { addSongCategory, removeSongCategory, type CategoryType } from 'store/modules/categories'
import styles from './SongInfo.css'

const TYPES: { value: CategoryType, label: string }[] = [
  { value: 'genre', label: 'Genre' },
  { value: 'decade', label: 'Decade' },
  { value: 'voice', label: 'Voice' },
  { value: 'language', label: 'Language' },
]

/**
 * Manual category edits for one song.
 *
 * Anything added here is stored as `manual`, which a later automatic scan
 * leaves alone — an online lookup guesses, a person knows, and a re-scan must
 * not undo the correction.
 */
const SongCategories = ({ songId }: { songId: number }) => {
  const dispatch = useAppDispatch()
  const { entities, songCategories } = useAppSelector(state => state.categories)
  const mine = songCategories[songId] ?? []

  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('genre')

  const handleAdd = () => {
    if (!name.trim()) return
    dispatch(addSongCategory({ songId, name: name.trim(), type }))
    setName('')
  }

  // suggest what the library already uses, so typing "balada" doesn't create a
  // near-duplicate of an existing "Balada"
  const suggestions = Array.from(new Set(
    Object.values(entities).filter(c => c.type === type).map(c => c.name),
  )).sort()

  return (
    <div className={styles.categoriesBlock}>
      <span className={styles.label}>Categories:</span>

      <div className={styles.chips}>
        {mine.length === 0 && <span className={styles.noneYet}>none yet</span>}
        {mine.map(categoryId => entities[categoryId] && (
          <span key={categoryId} className={styles.chip}>
            {entities[categoryId].name}
            <a
              className={styles.chipRemove}
              title='Remove'
              onClick={() => dispatch(removeSongCategory({ songId, categoryId }))}
            >
              ×
            </a>
          </span>
        ))}
      </div>

      <div className={styles.addRow}>
        <select className={styles.typeSelect} value={type} onChange={e => setType(e.target.value as CategoryType)}>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type='text'
          className={styles.categoryInput}
          list={`category-suggestions-${songId}`}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder='e.g. Bolero'
        />
        <datalist id={`category-suggestions-${songId}`}>
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
        <Button onClick={handleAdd} disabled={!name.trim()}>Add</Button>
      </div>
    </div>
  )
}

export default SongCategories
