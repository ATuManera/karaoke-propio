export interface Artist {
  artistId: number
  name: string
  songIds: number[]
  /** popularity of this artist's best-known song here; null when unknown */
  viewCount?: number | null
}

export interface Song {
  artistId: number
  duration: number
  songId: number
  title: string
  numMedia: number
  /** views of the source upload; null when unknown (see migration 009) */
  viewCount?: number | null
}

/**
 * Operational state of a queue item's pitch variant. This is derived state
 * owned by the server's PitchManager and is never persisted as durable truth.
 */
export type PitchStatus = 'ready' | 'preparing' | 'error'

/**
 * Where a saved pitch came from (see migration 012). 'inferred' is observed
 * (the song was queued at that pitch); the other two were decided by the
 * singer and outrank it.
 */
export type PitchPrefSource = 'assistant' | 'manual' | 'inferred'

/** One singer's pitch for one song. */
export interface SongPitchPref {
  pitchSemitones: number
  source: PitchPrefSource
  /** the recording it was determined against; null when no longer known */
  mediaId: number | null
  dateUpdated: number
}

/** A singer's saved pitches, keyed by songId. */
export type SongPitchPrefs = Record<number, SongPitchPref>

export interface QueueItem {
  queueId: number
  songId: number
  userId: number
  prevQueueId: number
  mediaId: number
  rgTrackGain: number
  rgTrackPeak: number
  userDateUpdated: number
  userDisplayName: string
  mediaType: 'cdg' | 'mp4'
  isOptimistic?: false
  isVideoKeyingEnabled: boolean
  pitchSemitones: number
  pitchStatus: PitchStatus
  pitchError?: string
}

export interface OptimisticQueueItem {
  isOptimistic: true
  prevQueueId: number
  queueId: number
  songId: number
  pitchSemitones: number
}

export interface IRoomPrefs {
  qr: {
    isEnabled: boolean
    opacity: number
    password: string
    size: number
  }
  user?: {
    isNewAllowed?: boolean
    isGuestAllowed?: boolean
  }
  roles?: Record<number, {
    allowNew: boolean
  }>
}

export interface Room {
  roomId: number
  name: string
  status: 'open' | 'closed'
  dateCreated: number
  hasPassword: boolean
  numUsers: number
  prefs?: IRoomPrefs
}

export interface Role {
  roleId: number
  name: string
}

export interface Path {
  pathId: number
  path: string
  priority: number
  prefs: {
    isVideoKeyingEnabled: boolean
    isWatchingEnabled: boolean
  }
}

export interface User {
  userId: number
  username: string
  name: string
  isAdmin: boolean // todo: client and server ctx only
  isGuest: boolean // todo: client and server ctx only
  dateCreated: number
  dateUpdated: number
}

export interface UserWithRole extends User {
  role?: string
}

export interface PlaybackOptions {
  cdgAlpha?: number
  cdgSize?: number
  mp4Alpha?: number
  visualizer?: {
    sensitivity?: number
    isEnabled?: boolean
    nextPreset?: boolean
    prevPreset?: boolean
    randomPreset?: boolean
  }
}

// ------------------------------------
// Acquisition (fetching a song from an external source)
// ------------------------------------
export type AcquisitionSource = 'youtube' | 'usdb'

export type AcquisitionState = 'searching' | 'downloading' | 'processing' | 'publishing' | 'registering' | 'queued' | 'error'

export interface AcquisitionSearchResult {
  /** source-specific id (YouTube video id, USDB song id) */
  id: string
  title: string
  artist?: string
  durationSeconds?: number | null
  uploader?: string | null
  thumbnail?: string | null
  /** YouTube only: lifetime views, the main signal for picking a good version */
  viewCount?: number | null
  /** YouTube only: channel carries a verification badge */
  isVerified?: boolean
}

export interface AcquisitionRequest {
  requestId: string
  roomId: number
  userId: number
  pitchSemitones: number
  source: AcquisitionSource
  query: string
  result?: AcquisitionSearchResult
  /** user-confirmed artist/title, chosen before the download started */
  artist?: string
  songTitle?: string
  viewCount?: number | null
  state: AcquisitionState
  error?: string
  songId?: number
  mediaId?: number
  queueId?: number
  dateCreated: number
}

export type MediaType = 'cdg' | 'mp4' | ''

export interface Media {
  songId: number
  mediaId: number
  isPreferred: boolean
  path: string
  relPath: string
  duration: number
}

export interface Prefs {
  isFirstRun?: boolean
  isScanning: boolean
  isReplayGainEnabled: boolean
  paths: {
    result: number[]
    entities: Record<number, Path>
  }
  roles: {
    result: number[]
    entities: Record<number, Role>
  }
  [key: string]: unknown
}
