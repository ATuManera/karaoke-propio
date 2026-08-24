export const SOCKET_REQUEST_CONNECT = 'user/SOCKET_REQUEST_CONNECT'
export const SOCKET_AUTH_ERROR = 'user/SOCKET_AUTH_ERROR'

// Library
export const LIBRARY_FILTER_STRING = 'library/FILTER_KEYWORD'
export const LIBRARY_FILTER_STRING_RESET = 'library/FILTER_KEYWORD_CLEAR'
export const LIBRARY_FILTER_TOGGLE_STARRED = 'library/TOGGLE_FILTER_STARRED'
export const TOGGLE_ARTIST_EXPANDED = 'library/TOGGLE_ARTIST_EXPANDED'
export const TOGGLE_ARTIST_RESULT_EXPANDED = 'library/TOGGLE_ARTIST_RESULT_EXPANDED'
export const SCROLL_ARTISTS = 'library/SCROLL_ARTISTS'
export const SONG_STARRED = 'library/SONG_STARRED'
export const SONG_UNSTARRED = 'library/SONG_UNSTARRED'
export const STAR_COUNTS_PUSH = 'library/STAR_COUNTS_PUSH'
export const LIBRARY_PUSH = 'library/PUSH'
export const LIBRARY_PUSH_SONG = 'library/PUSH_SONG'

// Queue
export const QUEUE_ADD = 'server/QUEUE_ADD'
export const QUEUE_MOVE = 'server/QUEUE_MOVE'
export const QUEUE_PUSH = 'queue/PUSH'
export const QUEUE_REMOVE = 'server/QUEUE_REMOVE'

// Dedications (what is said over a song while it plays). No push of their own:
// they ride the queue that already reaches every client, the player included.
export const QUEUE_DEDICATION_SET = 'server/QUEUE_DEDICATION_SET'
export const QUEUE_DEDICATION_REMOVE = 'server/QUEUE_DEDICATION_REMOVE'

// Acquisition (fetch a song from an external source: YouTube, USDB)
export const ACQUISITION_SEARCH = 'server/ACQUISITION_SEARCH'
/** read a public playlist's listing, to see which of its songs are already here */
export const ACQUISITION_PLAYLIST = 'server/ACQUISITION_PLAYLIST'
export const ACQUISITION_PREVIEW = 'server/ACQUISITION_PREVIEW'
export const ACQUISITION_ADD = 'server/ACQUISITION_ADD'
export const ACQUISITION_BULK = 'server/ACQUISITION_BULK'
export const ACQUISITION_PUSH = 'acquisition/PUSH'
export const ACQUISITION_BULK_PUSH = 'acquisition/BULK_PUSH'

// Player internal
export const PLAYER_UPDATE = 'player/UPDATE'

// Player room commands
export const PLAYER_CMD_NEXT = 'player/CMD_NEXT'
export const PLAYER_CMD_OPTIONS = 'player/CMD_OPTIONS'
export const PLAYER_CMD_PAUSE = 'player/CMD_PAUSE'
export const PLAYER_CMD_PLAY = 'player/CMD_PLAY'
export const PLAYER_REQ_SEEK = 'server/PLAYER_REQ_SEEK'
export const PLAYER_CMD_SEEK = 'player/PLAYER_CMD_SEEK'
export const PLAYER_CMD_REPLAY = 'player/CMD_REPLAY'
export const PLAYER_CMD_VOLUME = 'player/CMD_VOLUME'

export const PLAYER_REQ_NEXT = 'server/PLAYER_REQ_NEXT'
export const PLAYER_REQ_OPTIONS = 'server/PLAYER_REQ_OPTIONS'
export const PLAYER_REQ_PAUSE = 'server/PLAYER_REQ_PAUSE'
export const PLAYER_REQ_PLAY = 'server/PLAYER_REQ_PLAY'
export const PLAYER_REQ_REPLAY = 'server/PLAYER_REQ_REPLAY'
export const PLAYER_REQ_VOLUME = 'server/PLAYER_REQ_VOLUME'
export const PLAYER_EMIT_STATUS = 'server/PLAYER_EMIT_STATUS'
export const PLAYER_EMIT_LEAVE = 'server/PLAYER_EMIT_LEAVE'
/** a song reached its own end (not a skip, not an error) */
export const PLAYER_EMIT_ENDED = 'server/PLAYER_EMIT_ENDED'

// Player events
export const PLAYER_STATUS = 'status/PLAYER_STATUS'
export const PLAYER_ERROR = 'status/PLAYER_ERROR'
export const PLAYER_LEAVE = 'status/PLAYER_LEAVE'
export const PLAYER_LOAD = 'status/PLAYER_LOAD'
export const PLAYER_PLAY = 'status/PLAYER_PLAY'
export const PLAYER_VISUALIZER_ERROR = 'status/PLAYER_VISUALIZER_ERROR'

// User
export const LOGIN = 'user/LOGIN'
export const LOGOUT = 'user/LOGOUT'
export const ACCOUNT_RECEIVE = 'user/ACCOUNT_RECEIVE'
export const ACCOUNT_CREATE = 'user/ACCOUNT_CREATE'
export const ACCOUNT_UPDATE = 'user/ACCOUNT_UPDATE'
export const ACCOUNT_REQUEST = 'user/ACCOUNT_REQUEST'
export const ACCOUNT_LOCALE_SET = 'user/ACCOUNT_LOCALE_SET'

// Rooms
export const ROOMS_RECEIVE = 'rooms/RECEIVE'
export const ROOMS_REQUEST = 'rooms/REQUEST'
export const ROOM_UPDATE = 'rooms/UPDATE'
export const ROOM_CREATE = 'rooms/CREATE'
export const ROOM_REMOVE = 'rooms/REMOVE'
export const ROOM_EDITOR_OPEN = 'rooms/EDITOR_OPEN'
export const ROOM_EDITOR_CLOSE = 'rooms/EDITOR_CLOSE'
export const ROOM_FILTER_STATUS = 'rooms/TOGGLE_SHOW_ALL'
export const ROOM_PREFS_PUSH = 'rooms/ROOM_PREFS_PUSH'
/**
 * Whether the room a client is in has dedications turned on. A channel of its
 * own, and not part of the room prefs, because every phone in the room needs
 * the answer and only the Player ever fetches those.
 */
export const ROOM_DEDICATIONS_PUSH = 'rooms/DEDICATIONS_PUSH'
/** an admin flipping that switch from the playback menu, mid-party */
export const ROOM_DEDICATIONS_SET = 'server/ROOM_DEDICATIONS_SET'
export const ROOM_PREFS_PUSH_REQUEST = 'server/ROOM_PREFS_PUSH_REQUEST'

// Pitch preferences (the pitch a given user sings a given song best in)
export const SET_SONG_PITCH_PREF = 'server/SET_SONG_PITCH_PREF'
export const CLEAR_SONG_PITCH_PREF = 'server/CLEAR_SONG_PITCH_PREF'
export const PITCH_PREFS_PUSH = 'user/PITCH_PREFS_PUSH'

// Pitch feedback ("how was that pitch?", asked after singing)
export const PITCH_FEEDBACK_PUSH = 'user/PITCH_FEEDBACK_PUSH'
export const PITCH_FEEDBACK_RESPOND = 'server/PITCH_FEEDBACK_RESPOND'
export const PITCH_FEEDBACK_RESOLVED = 'user/PITCH_FEEDBACK_RESOLVED'

// Stars
export const STAR_SONG = 'server/STAR_SONG'
export const UNSTAR_SONG = 'server/UNSTAR_SONG'
export const STARS_PUSH = 'user/STARS_PUSH'

// Preferences
export const PREFS_RECEIVE = 'prefs/RECEIVE'
export const PREFS_REQUEST = 'prefs/REQUEST'
export const PREFS_SET = 'server/PREFS_SET'
export const PREFS_PATH_SET_PRIORITY = 'server/PREFS_PATH_SET_PRIORITY'
export const PREFS_PATH_UPDATE = 'prefs/PREFS_PATH_UPDATE'
export const PREFS_PUSH = 'prefs/PREFS_PUSH'
export const PREFS_REQ_SCANNER_START = 'prefs/REQ_SCANNER_START'
export const PREFS_REQ_SCANNER_STOP = 'prefs/REQ_SCANNER_STOP'

// User management
export const USERS_CREATE = 'users/CREATE'
export const USERS_EDITOR_OPEN = 'users/EDITOR_OPEN'
export const USERS_EDITOR_CLOSE = 'users/EDITOR_CLOSE'
export const USERS_FILTER_ONLINE = 'users/FILTER_ONLINE'
export const USERS_FILTER_ROOM_ID = 'users/FILTER_ROOM_ID'
export const USERS_REMOVE = 'users/REMOVE'
export const USERS_REQUEST = 'users/REQUEST'
export const USERS_UPDATE = 'users/UPDATE'

// UI
export const HEADER_HEIGHT_CHANGE = 'ui/HEADER_HEIGHT_CHANGE'
export const FOOTER_HEIGHT_CHANGE = 'ui/FOOTER_HEIGHT_CHANGE'
export const SHOW_ERROR_MESSAGE = 'ui/SHOW_ERROR_MESSAGE'
export const CLEAR_ERROR_MESSAGE = 'ui/CLEAR_ERROR_MESSAGE'
export const UI_WINDOW_RESIZE = 'ui/WINDOW_RESIZE'

// Song Info
export const SONG_INFO_REQUEST = 'songInfo/SONG_INFO_REQUEST'
export const SONG_INFO_SET_PREFERRED = 'songInfo/SET_PREFERRED'
export const SONG_INFO_CLOSE = 'songInfo/SONG_INFO_CLOSE'

// IPC Messages
export const REQUEST_SCAN = 'scannerWorker/REQUEST_SCAN'
export const REQUEST_SCAN_STOP = 'scannerWorker/REQUEST_SCAN_STOP'
export const SCANNER_WORKER_STATUS = 'scannerWorker/STATUS'
export const SERVER_WORKER_STATUS = 'serverWorker/STATUS'
export const SERVER_WORKER_ERROR = 'serverWorker/ERROR'
export const LIBRARY_MATCH_SONG = 'scannerWorker/LIBRARY_MATCH_SONG'
export const MEDIA_ADD = 'scannerWorker/MEDIA_ADD'
export const MEDIA_CLEANUP = 'scannerWorker/MEDIA_CLEANUP'
export const MEDIA_REMOVE = 'scannerWorker/MEDIA_REMOVE'
export const MEDIA_UPDATE = 'scannerWorker/MEDIA_UPDATE'
export const WATCHER_WORKER_EVENT = 'watcherWorker/EVENT'
export const WATCHER_WORKER_WATCH = 'watcherWorker/WATCH'

// Same-process messages via EventEmitter
export const SCANNER_WORKER_EXITED = 'scannerWorker/EXITED'
export const PREFS_PATHS_CHANGED = 'serverWorker/PREFS_PATHS_CHANGED'

// Misc
export const _SUCCESS = '_SUCCESS'
export const _ERROR = '_ERROR'
export const REDUX_SLICE_INJECT_NOOP = 'app/REDUX_SLICE_INJECT_NOOP'
