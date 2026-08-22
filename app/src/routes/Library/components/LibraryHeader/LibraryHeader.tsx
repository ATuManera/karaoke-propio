import React, { useEffect, useState, useRef } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setFilterStr, resetFilterStr, toggleFilterStarred } from '../../modules/library'
import Button from 'components/Button/Button'
import CategoryFilter from 'components/CategoryFilter/CategoryFilter'
import { fetchPendingReview, toggleFilterPendingReview } from 'store/modules/songReview'
import styles from './LibraryHeader.css'

const LibraryHeader = () => {
  const dispatch = useAppDispatch()
  const { filterStr, filterStarred, version } = useAppSelector(state => state.library)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const { pending, isFiltering } = useAppSelector(state => state.songReview)

  // A second version of a song already here arrives as LIBRARY_PUSH_SONG,
  // which does not move the library version — so the run's own start and end
  // are watched too, or the flag would wait for something unrelated to change.
  const isBulkRunning = useAppSelector(state => !!state.acquisition.bulk?.isRunning)

  useEffect(() => {
    if (isAdmin) dispatch(fetchPendingReview())
  }, [dispatch, isAdmin, version, isBulkRunning])

  const searchInput = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(filterStr)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
    dispatch(setFilterStr(event.target.value))
  }

  const clearSearch = () => {
    setValue('')
    dispatch(resetFilterStr())
  }

  const handleMagnifierClick = () => {
    if (value.trim()) clearSearch()
    else searchInput.current?.focus()
  }

  return (
    <>
      <div className={styles.container}>
        <Button
          className={clsx(styles.btnMagnifier, filterStr && styles.active)}
          icon='MAGNIFIER'
          onClick={handleMagnifierClick}
        />
        <input
          type='search'
          className={styles.searchInput}
          // the only place a playlist import is announced: pasting a link is
          // the whole gesture, and it was invisible while this said 'search'
          placeholder='search or paste a playlist'
          value={value}
          onChange={handleChange}
          ref={searchInput}
        />
        {filterStr && (
          <Button
            icon='CLEAR'
            onClick={clearSearch}
            className={clsx(styles.btnClear, styles.active)}
          />
        )}
        <Button
          className={clsx(styles.btnStar, filterStarred && styles.active)}
          icon='STAR_FULL'
          onClick={() => dispatch(toggleFilterStarred())}
        />
        {/* Only while there is something to review, and only for the admin who
            can act on it: a filter that always shows zero is a permanent
            reminder of nothing. */}
        {isAdmin && pending.length > 0 && (
          <Button
            className={clsx(styles.btnReview, isFiltering && styles.active)}
            icon='FLAG'
            onClick={() => dispatch(toggleFilterPendingReview())}
            title={`${pending.length} bulk-imported song(s) to check`}
          />
        )}
      </div>
      <CategoryFilter />
    </>
  )
}

export default LibraryHeader
