import type { Room } from 'shared/types'
import type { Translate } from 'shared/i18n'

/**
 * What a room's line says about it, in the two places somebody chooses one:
 * the picker after sign-in (RoomGate) and My Room on the account screen.
 *
 * One function because they are one question asked twice, and because they
 * disagreed once already — the picker named a closed room and the panel did
 * not, so the same room read differently depending on how you arrived at it.
 *
 * The count replaces the older "someone here". That phrase answered a question
 * nobody was asking: whoever is deciding where to sing wants to know whether
 * they are joining two people or eleven, and "someone here" reads identically
 * for both. `numUsers` is socket connections in the room — the same number the
 * Rooms panel shows an admin — so a phone with two tabs open counts twice and
 * a phone that has just gone to sleep stops counting.
 */
export function roomStateLabel (
  room: Pick<Room, 'status' | 'numUsers'>,
  t: Translate,
): string {
  if (room.status === 'closed') return t('selectRoom.closed')

  // A room list fetched before this server knew how to count omits the field
  // entirely; nought is the honest reading, and it is what an empty room says.
  return t('selectRoom.usersConnected', { count: room.numUsers ?? 0 })
}

export function roomOptionLabel (
  room: Pick<Room, 'name' | 'status' | 'numUsers'>,
  t: Translate,
): string {
  return `${room.name} — ${roomStateLabel(room, t)}`
}
