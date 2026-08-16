import io from 'socket.io-client'

const socket = io({
  autoConnect: false,
  path: new URL(document.baseURI).pathname + 'socket.io',
})

/**
 * Reload the Player when the server starts serving a different build.
 *
 * The Player is left running on a TV for days, so a deploy leaves it executing
 * old code while looking completely healthy — everything already loaded keeps
 * working and only newly added commands are ignored, which is very hard to
 * recognise as "this screen is stale" (it cost a full debugging session once).
 *
 * Deliberately limited to the Player: other screens are refreshed by their
 * users naturally, and yanking the page out from under someone mid-search
 * would be worse than the staleness.
 */
let knownBuildId: string | null = null

socket.on('buildId', (id: string) => {
  if (knownBuildId === null) {
    knownBuildId = id
    return
  }

  if (id === knownBuildId) return

  const isPlayer = window.location.pathname.replace(/\/+$/, '').endsWith('/player')
  if (!isPlayer) return

  // reconnects happen on any server restart; only a genuinely different build
  // gets here, so reloading now picks up the new code
  window.location.reload()
})

export default socket
