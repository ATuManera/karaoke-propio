import React, { useState, useRef } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setFilterStr, resetFilterStr, toggleFilterStarred } from '../../modules/library'
import Button from 'components/Button/Button'
import CategoryFilter from 'components/CategoryFilter/CategoryFilter'
import styles from './LibraryHeader.css'

const LibraryHeader = () => {
  const dispatch = useAppDispatch()
  const { filterStr, filterStarred } = useAppSelector(state => state.library)

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
      </div>
      <CategoryFilter />
    </>
  )
}

export default LibraryHeader
