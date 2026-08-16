import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { fetchCategories, startCategoryScan, toggleCategoryFilter, clearCategoryFilters, type CategoryType } from 'store/modules/categories'
import { setLibrarySort } from 'routes/Library/modules/library'
import HttpApi from 'lib/HttpApi'
import styles from './CategoryFilter.css'

// order the groups the way someone narrows down a song: what kind of music
// first, then when, then who, then language
const TYPE_ORDER: CategoryType[] = ['genre', 'decade', 'voice', 'language']
const TYPE_LABELS: Record<CategoryType, string> = {
  genre: 'Genre',
  decade: 'Decade',
  voice: 'Voice',
  language: 'Language',
}

/**
 * Chips to narrow the library by category. Hidden entirely until the library
 * has some — an empty filter bar is just noise on a fresh install, and
 * categories only exist after an admin runs the scan.
 */
const api = new HttpApi()

const CategoryFilter = () => {
  const dispatch = useAppDispatch()
  const sort = useAppSelector(state => state.library.sort)
  const { result, entities, selected, isScanning } = useAppSelector(state => state.categories)
  // Collapsed by default. With a grown library this panel listed 40+ chips and
  // took nearly half a phone screen, pushing the actual song list out of view —
  // a filter is a tool you reach for, not something to stare at permanently.
  const [isOpen, setIsOpen] = useState(false)
  const libraryVersion = useAppSelector(state => state.library.version)
  const isAdmin = useAppSelector(state => state.user.isAdmin)

  // refetch when the library changes: songs may have gained or lost categories
  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch, libraryVersion])

  const handleScan = () => {
    // minutes-long and rate-limited upstream, so say so rather than let it look frozen
    if (window.confirm('Look up categories online for uncategorized songs?\n\nTakes ~1 second per song and continues in the background.')) {
      dispatch(startCategoryScan(false))
    }
  }

  const sortControl = (
    <div className={styles.group}>
      <span className={styles.groupLabel}>Sort</span>
      <button
        type='button'
        className={clsx(styles.chip, sort === 'name' && styles.selected)}
        onClick={() => dispatch(setLibrarySort('name'))}
      >
        A-Z
      </button>
      <button
        type='button'
        className={clsx(styles.chip, sort === 'popular' && styles.selected)}
        onClick={() => dispatch(setLibrarySort('popular'))}
      >
        Most popular
      </button>
      {isAdmin && (
        <button
          type='button'
          className={styles.scan}
          onClick={() => {
            if (window.confirm('Look up popularity for songs that don\'t have it yet?\n\nTakes ~2s per song and continues in the background.')) {
              api.request('POST', 'popularity/backfill', { body: {} }).catch(() => undefined)
            }
          }}
        >
          Update popularity
        </button>
      )}
    </div>
  )

  const scanButton = isAdmin && (
    <button type='button' className={styles.scan} onClick={handleScan} disabled={isScanning}>
      {isScanning ? 'Categorizing…' : 'Categorize library'}
    </button>
  )

  // nothing to filter by yet: an admin still needs a way to create the first
  // categories, everyone else sees nothing at all
  // the sort control is useful even before any category exists
  if (!result.length) {
    return (
      <div className={styles.container}>
        <div className={styles.bar}>
          {sortControl}
          {scanButton}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.bar}>
        {sortControl}

        <button
          type='button'
          className={clsx(styles.toggle, selected.length && styles.toggleActive)}
          onClick={() => setIsOpen(o => !o)}
          aria-expanded={isOpen}
        >
          {`Filters${selected.length ? ` (${selected.length})` : ''}`}
          <span className={styles.caret}>{isOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Applied filters stay visible even when collapsed, so the list is never
          narrowed by something the user can't see or undo. */}
      {!isOpen && !!selected.length && (
        <div className={styles.group}>
          {selected.map(id => entities[id] && (
            <button
              key={id}
              type='button'
              className={clsx(styles.chip, styles.selected)}
              onClick={() => dispatch(toggleCategoryFilter(id))}
              title='Remove filter'
            >
              {entities[id].name}
              <span className={styles.count}>×</span>
            </button>
          ))}
          <button type='button' className={styles.clear} onClick={() => dispatch(clearCategoryFilters())}>
            Clear
          </button>
        </div>
      )}

      {isOpen && (
        <div className={styles.panel}>
          {TYPE_ORDER.map((type) => {
            const ids = result.filter(id => entities[id].type === type)
            if (!ids.length) return null

            return (
              <div key={type} className={styles.group}>
                <span className={styles.groupLabel}>{TYPE_LABELS[type]}</span>
                {ids.map(id => (
                  <button
                    key={id}
                    type='button'
                    className={clsx(styles.chip, selected.includes(id) && styles.selected)}
                    onClick={() => dispatch(toggleCategoryFilter(id))}
                  >
                    {entities[id].name}
                    <span className={styles.count}>{entities[id].songCount}</span>
                  </button>
                ))}
              </div>
            )
          })}

          <div className={styles.actions}>
            {!!selected.length && (
              <button type='button' className={styles.clear} onClick={() => dispatch(clearCategoryFilters())}>
                Clear filters
              </button>
            )}
            {scanButton}
          </div>
        </div>
      )}
    </div>
  )
}

export default CategoryFilter
