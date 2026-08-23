import React, { useCallback, useRef, useState } from 'react'
import { ensureState } from 'redux-optimistic-ui'
import { RootState } from 'store/store'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { toggleArtistResultExpanded } from '../../modules/library'
import getSearchResults from '../../selectors/getSearchResults'
import getBrowseArtists from '../../selectors/getBrowseArtists'
import getSongsStatus from '../../selectors/getSongsStatus'
import PaddedList from 'components/PaddedList/PaddedList'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import Button from 'components/Button/Button'
import AcquisitionModal from 'components/AcquisitionModal/AcquisitionModal'
import { parsePlaylistId } from 'shared/youtubePlaylist'
import { recheckPendingNames } from 'store/modules/songReview'
import ArtistItem from '../ArtistItem/ArtistItem'
import SongList from '../SongList/SongList'
import type { ListImperativeAPI, RowComponentProps } from 'react-window'
import styles from './SearchResults.css'
import { useT } from 'lib/i18n'

const ROW_HEIGHT_RESULT_HEADING = 24
const ROW_HEIGHT_ARTIST = 48
const ROW_HEIGHT_SONG = 56 // 52px + 4px margin
const ROW_HEIGHT_SONG_WITH_ARTIST = 68 // 64px + 4px margin

interface SearchResultsProps {
  // starredArtistCounts: Record<number, number> // @todo
  ui: RootState['ui']
}

interface CustomRowProps {
  artists: RootState['artists']
  dispatch: ReturnType<typeof useAppDispatch>
  expandedArtists: number[]
  filterKeywords: string[]
  filterStarred: boolean
  artistsResult: number[]
  songsResult: number[]
  expandedArtistResults: number[]
}

// this is outside the SearchResults component to keep the reference as stable as possible,
// as react-window will re-render the list (breaking animations) when RowComponent changes
const RowComponent = ({
  index,
  style,
  // below are also used in SearchResults and passed via rowProps to avoid duplicate effort
  dispatch,
  artists,
  filterKeywords,
  filterStarred,
  artistsResult,
  songsResult,
  expandedArtistResults,
}: RowComponentProps<CustomRowProps>) => {
  const { starredSongs } = useAppSelector(state => ensureState(state.userStars))
  const { upcoming } = useAppSelector(getSongsStatus)

  // # artist results heading
  if (index === 0) {
    // an empty section is noise: searching an artist's name matches no song
    // titles, which showed a stray "0 songs" row under their results
    if (!artistsResult.length) return null

    return (
      <div key='artistsHeading' style={style} className={styles.artistsHeading}>
        {artistsResult.length}
        {' '}
        {filterStarred ? 'starred ' : ''}
        {artistsResult.length === 1 ? 'artist' : 'artists'}
      </div>
    )
  }

  // artist results
  if (index > 0 && index < artistsResult.length + 1) {
    const artistId = artistsResult[index - 1]
    const artist = artists.entities[artistId]

    return (
      <ArtistItem
        artistSongIds={artist.songIds}
        // numStars={props.starredArtistCounts[artistId] || 0}
        filterKeywords={filterKeywords}
        isExpanded={expandedArtistResults.includes(artistId)}
        key={artistId}
        name={artist.name}
        numStars={0}
        onArtistClick={() => dispatch(toggleArtistResultExpanded(artistId))}
        upcomingSongs={upcoming}
        starredSongs={starredSongs}
        style={style}
      />
    )
  }

  // # song results heading
  if (index === artistsResult.length + 1) {
    if (!songsResult.length) return null

    return (
      <div key='songsHeading' style={style} className={styles.songsHeading}>
        {songsResult.length}
        {' '}
        {filterStarred ? 'starred ' : ''}
        {songsResult.length === 1 ? 'song' : 'songs'}
      </div>
    )
  }

  // song results
  if (!songsResult.length) return null

  return (
    <div style={style} key='songs'>
      <SongList
        songIds={songsResult}
        showArtist
        filterKeywords={filterKeywords}
      />
    </div>
  )
}

const SearchResults = ({ ui }: SearchResultsProps) => {
  const t = useT()
  const dispatch = useAppDispatch()
  // same source as browsing, so an expanded artist's songs follow the chosen
  // order here too
  const artists = useAppSelector(getBrowseArtists)
  const expandedArtistResults = useAppSelector(state => state.library.expandedArtistResults)
  const { filterStr, filterStarred } = useAppSelector(state => state.library)
  const { artistsResult, songsResult } = useAppSelector(getSearchResults)

  const playlist = useAppSelector(state => state.acquisition.playlist)
  const { pending, isFiltering: isFilteringPendingReview, isRechecking } = useAppSelector(state => state.songReview)

  const handleRecheck = () => {
    // minutes long, rate limited upstream, and it renames files — so it is
    // asked for once and explicitly, the same way the category scan is
    const message = `Read the names of these ${pending.length} songs again?\n\n`
      + `Anything MusicBrainz recognises the other way round gets its artist and `
      + `title swapped, and its files renamed. Takes a couple of seconds per song `
      + `and continues in the background. They all stay flagged for you either way.`

    if (window.confirm(message)) dispatch(recheckPendingNames())
  }

  const listRef = useRef<ListImperativeAPI | null>(null)
  const filterKeywords = filterStr.trim() ? filterStr.trim().toLowerCase().split(' ') : []
  // null when closed; otherwise which half of the modal to open on
  const [acquisitionView, setAcquisitionView] = useState<'search' | 'playlist' | null>(null)

  // a link pasted into the library's search box is not a search anyone meant to
  // run, so say what it actually is instead of reporting nothing found
  const isPlaylistLink = !!parsePlaylistId(filterStr.trim())

  // The "Search YouTube" bar floats over the list, so the list has to end above
  // it — otherwise the last row sits underneath and cannot be reached by
  // scrolling (an artist with 10 songs lost the 10th). Measured rather than
  // hard-coded so it stays correct at any font size or zoom.
  const [moreBarHeight, setMoreBarHeight] = useState(0)
  const moreBarRef = useCallback((el: HTMLDivElement | null) => {
    setMoreBarHeight(el ? el.getBoundingClientRect().height : 0)
  }, [])

  // acquisition order (see prompt_de_implementacion.md #33): local library
  // first, always — this only appears once a real text search has already
  // come up empty locally (filterStarred alone isn't a "no results" case)
  const isNoLocalResults = !!filterStr.trim() && artistsResult.length === 0 && songsResult.length === 0

  const rowHeight = (index: number) => {
    // artists heading
    if (index === 0) return artistsResult.length ? ROW_HEIGHT_RESULT_HEADING : 0

    // artist results
    if (index > 0 && index < artistsResult.length + 1) {
      const artistId = artistsResult[index - 1]
      let height = ROW_HEIGHT_ARTIST

      if (expandedArtistResults.includes(artistId)) {
        height += artists.entities[artistId].songIds.length * ROW_HEIGHT_SONG
      }

      return height
    }

    // songs heading
    if (index === artistsResult.length + 1) return songsResult.length ? ROW_HEIGHT_RESULT_HEADING : 0

    // song results
    return songsResult.length * ROW_HEIGHT_SONG_WITH_ARTIST
  }

  const handleRef = (ref: ListImperativeAPI) => {
    if (ref) {
      listRef.current = ref
      // listRef.current.scrollToRow({ index: props.scrollRow, align: 'start' })
    }
  }

  if (isNoLocalResults) {
    return (
      <>
        <TextOverlay className={styles.noResults}>
          <h1>{isPlaylistLink ? t('library.thatsAPlaylist') : t('library.noLocalResults')}</h1>
          <p>
            {isPlaylistLink
              ? t('library.seeWhichSongsAreHere')
              : t('library.trySearchingYouTube')}
          </p>
          <Button variant='primary' onClick={() => setAcquisitionView('search')}>
            {isPlaylistLink ? t('library.openPlaylist') : t('library.searchYouTube')}
          </Button>
        </TextOverlay>

        {acquisitionView && (
          <AcquisitionModal
            initialQuery={filterStr.trim()}
            initialView={acquisitionView}
            onClose={() => setAcquisitionView(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <PaddedList
        rowComponent={RowComponent}
        rowProps={{
          dispatch,
          artists,
          filterStarred,
          filterKeywords,
          artistsResult,
          songsResult,
          expandedArtistResults,
        }}
        rowHeight={rowHeight}
        numRows={artistsResult.length + 3}
        paddingTop={ui.headerHeight}
        paddingRight={4}
        paddingBottom={ui.footerHeight + moreBarHeight}
        height={ui.innerHeight}
        onRef={handleRef}
      />

      {/* Having *a* local match doesn't mean it's the one they want: searching
          an artist they already own one song by used to dead-end, with no way
          to reach YouTube from here. Anchored above the footer so it stays
          reachable without scrolling the virtualized list to its end. */}
      {!!filterStr.trim() && (
        <div ref={moreBarRef} className={styles.moreBar} style={{ bottom: ui.footerHeight }}>
          {/* tapping a song the playlist turned up leaves this list filtered to
              it, so the way back has to be somewhere — the playlist itself
              survives in the store until another one replaces it */}
          {playlist && (
            <Button className={styles.moreButton} onClick={() => setAcquisitionView('playlist')}>
              {t('library.yourPlaylist')}
            </Button>
          )}
          <Button
            className={styles.moreButton}
            variant='primary'
            onClick={() => setAcquisitionView('search')}
          >
            {t('library.notWhatYouWanted')}
          </Button>
        </div>
      )}

      {/* The first import into a library happens before the library knows
          anybody, so the artist/title reading has nothing to check itself
          against and comes out backwards often enough to matter. This is the
          way to fix them all without re-downloading anything. */}
      {isFilteringPendingReview && pending.length > 0 && (
        <div ref={moreBarRef} className={styles.moreBar} style={{ bottom: ui.footerHeight }}>
          <Button
            className={styles.moreButton}
            variant='primary'
            disabled={isRechecking}
            onClick={handleRecheck}
          >
            {isRechecking ? t('common.starting') : t('library.rereadNames', { count: pending.length })}
          </Button>
        </div>
      )}

      {acquisitionView && (
        <AcquisitionModal
          initialQuery={filterStr.trim()}
          initialView={acquisitionView}
          onClose={() => setAcquisitionView(null)}
        />
      )}
    </>
  )
}

export default SearchResults
