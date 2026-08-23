import React, { useState } from 'react'
import { useAppSelector } from 'store/hooks'
import { Link } from 'react-router'
import { Trans } from 'react-i18next'
import { msg, useT } from 'lib/i18n'
import ArtistList from '../components/ArtistList/ArtistList'
import SearchResults from '../components/SearchResults/SearchResults'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import Spinner from 'components/Spinner/Spinner'
import styles from './LibraryView.css'

const LibraryView = () => {
  const t = useT()
  const { isAdmin } = useAppSelector(state => state.user)
  const { isLoading, filterStr, filterStarred } = useAppSelector(state => state.library)
  const songsResult = useAppSelector(state => state.songs.result)
  const selectedCategories = useAppSelector(state => state.categories.selected)
  const isFilteringPendingReview = useAppSelector(state => state.songReview.isFiltering)
  const ui = useAppSelector(state => state.ui)

  // EVERY filter has to be listed here, not just the ones typed into the
  // search box: this is what decides whether the screen shows the filtered
  // results at all. A filter missing from this line still changes state and
  // still narrows the results view — it just leaves the browse-by-artist
  // screen, which is the default, rendering as if nothing happened. That has
  // now cost the category chips and the review flag one bug each.
  const isSearching = !!filterStr.trim().length
    || filterStarred
    || selectedCategories.length > 0
    || isFilteringPendingReview
  const [initialHeaderHeight] = useState(ui.headerHeight)
  const [finalHeaderHeight, setFinalHeaderHeight] = useState(null)

  // don't render ArtistList until headerHeight is stable; otherwise
  // scroll position restoration does not work well (appears OBO)
  // @todo - this is hacky
  if (finalHeaderHeight === null && ui.headerHeight > initialHeaderHeight) {
    setFinalHeaderHeight(ui.headerHeight)
  }

  if (!finalHeaderHeight) return null

  return (
    <>
      {!isSearching && <ArtistList ui={ui} />}

      {isSearching && <SearchResults ui={ui} />}

      {isLoading && <Spinner />}

      {!isLoading && songsResult.length === 0 && (
        <TextOverlay className={styles.empty}>
          <h1>{t('library.empty')}</h1>
          {isAdmin && (
            <p>
              <Trans
                i18nKey={msg('library.addMediaFoldersToStart')}
                components={{ a: <Link to='/account' /> }}
              />
            </p>
          )}
        </TextOverlay>
      )}
    </>
  )
}

export default LibraryView
