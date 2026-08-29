import { RootState } from 'store/store'
import { createSelector } from '@reduxjs/toolkit'

const getResult = (state: RootState) => state.rooms.result
const getEntities = (state: RootState) => state.rooms.entities
const getFilterStatus = (state: RootState) => state.rooms.filterStatus

/**
 * The rooms the admin asked to see.
 *
 * `false` is "all of them"; 'open' and 'closed' are the room's own status; and
 * 'live' is the question actually being asked in the middle of a party — which
 * rooms have somebody in them. An installation grows rooms and never loses
 * them, so by the sixth one the list is mostly history.
 */
const getRoomList = createSelector(
  [getResult, getEntities, getFilterStatus],
  (result, entities, status) => ({
    result: result.filter((roomId) => {
      if (status === false) return true
      if (status === 'live') return entities[roomId].status === 'open' && entities[roomId].numUsers > 0
      return entities[roomId].status === status
    }),
    entities,
  }))

export default getRoomList
