import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { formatDateTime } from 'lib/dateTime'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import EditRoom from './EditRoom/EditRoom'
import { closeRoomEditor, fetchRooms, filterByStatus, openRoomEditor } from 'store/modules/rooms'
import { filterByRoom } from '../../modules/users'
import getRoomList from '../../selectors/getRoomList'
import type { Room } from 'shared/types'
import styles from './Rooms.css'
import { useT } from 'lib/i18n'

const Rooms = () => {
  const t = useT()
  // undefined, not null: EditRoom tells "create" from "edit" by the absence of
  // a room, and null is a room it would try to read fields off
  const [editorRoom, setEditorRoom] = useState<Room | undefined>(undefined)

  const { isEditorOpen, filterStatus } = useAppSelector(state => state.rooms)
  const rooms = useAppSelector(getRoomList)

  const dispatch = useAppDispatch()
  const handleClose = () => dispatch(closeRoomEditor())
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.currentTarget.value === 'all') dispatch(filterByStatus(false))
    else dispatch(filterByStatus(e.currentTarget.value))
  }
  const handleFilterUsers = (e: React.MouseEvent<HTMLElement>) => dispatch(filterByRoom(parseInt(e.currentTarget.dataset.roomId)))
  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setEditorRoom(rooms.entities[parseInt(e.currentTarget.dataset.roomId, 10)])
    dispatch(openRoomEditor())
  }
  const handleCreate = () => {
    setEditorRoom(undefined)
    dispatch(openRoomEditor())
  }

  // once per mount
  useEffect(() => {
    dispatch(fetchRooms())
  }, [dispatch])

  const rows = rooms.result.map((roomId) => {
    const room = rooms.entities[roomId]
    return (
      <tr key={String(roomId)}>
        <td translate='no'><a data-room-id={roomId} onClick={handleOpen}>{room.name}</a></td>
        <td>
          {room.status === 'open' ? t('rooms.open') : t('rooms.closed')}
          {room.numUsers > 0 && (
            <>
&nbsp;
              <a data-room-id={roomId} onClick={handleFilterUsers}>
                (
                {room.numUsers}
                )
              </a>
            </>
          )}
        </td>
        <td>{formatDateTime(new Date(room.dateCreated * 1000))}</td>
      </tr>
    )
  })

  const roomsFilter = (
    <select className={styles.roomsFilter} onChange={handleFilterChange} value={filterStatus === false ? 'all' : filterStatus as string}>
      <option key='all' value='all'>{t('rooms.all')}</option>
      <option key='open' value='open'>{t('rooms.open')}</option>
      {/* the party question: not "which rooms exist" but "where is anybody" */}
      <option key='live' value='live'>{t('rooms.withPeople')}</option>
      <option key='closed' value='closed'>{t('rooms.closed')}</option>
    </select>
  )

  // Folded by default, and counted under the filter that is actually on: an
  // installation accumulates rooms and never loses them, so this table is the
  // tallest thing on the screen long before anybody notices.
  //
  // The default filter is deliberately left at 'open' rather than moved to
  // 'withPeople'. The reason to open this panel is usually to manage one room
  // — create it, rename it, close it — and a default that hides every empty
  // room hides the one that was being looked for.
  return (
    <Panel
      collapsible
      title={t('rooms.titleWithCount', { count: rows.length })}
      titleComponent={roomsFilter}
    >
      <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('rooms.name')}</th>
              <th>{t('rooms.status')}</th>
              <th>{t('rooms.created')}</th>
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>

        {/* An empty table under a filter reads as "something is broken"; said
            plainly it reads as "nothing matches", which is what it means. */}
        {rows.length === 0 && (
          <p className={styles.empty}>
            {filterStatus === 'live' ? t('rooms.noneWithPeople') : t('rooms.noneMatch')}
          </p>
        )}

        <br />
        <Button onClick={handleCreate} variant='primary'>
          {t('rooms.createRoom')}
        </Button>

        {isEditorOpen && <EditRoom onClose={handleClose} room={editorRoom} />}
      </>
    </Panel>
  )
}

export default Rooms
