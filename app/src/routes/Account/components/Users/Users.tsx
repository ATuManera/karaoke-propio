import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { closeUserEditor, fetchUsers, filterByOnline, filterByRoom, openUserEditor, type UserWithRoomsAndRole } from '../../modules/users'
import { formatDateTime } from 'lib/dateTime'
import type { MessageKey, Translate } from 'shared/i18n'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import EditUser from './EditUser/EditUser'
import getUsers from '../../selectors/getUsers'
import styles from './Users.css'
import { useT } from 'lib/i18n'

/**
 * A role name, said in the reader's language. Keyed off what is stored rather
 * than matched against the three the editor offers: migration 005 also
 * creates 'player', and folding an unknown role into "Standard" would rename
 * an account on screen that nobody asked to rename.
 */
const roleLabel = (role: string, t: Translate) =>
  t(`account.role.${role}` as MessageKey, { defaultValue: role })

const Users = () => {
  const t = useT()
  const [editorUser, setEditorUser] = useState<UserWithRoomsAndRole | null>(null)

  const curUserId = useAppSelector(state => state.user.userId)
  const { isEditorOpen, filterOnline, filterRoomId } = useAppSelector(state => state.users)
  const rooms = useAppSelector(state => state.rooms)
  const users = useAppSelector(getUsers)

  const dispatch = useAppDispatch()
  const handleClose = () => dispatch(closeUserEditor())
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'all') dispatch(filterByOnline(false))
    else if (e.target.value === 'online') dispatch(filterByOnline(true))
    else dispatch(filterByRoom(parseInt(e.target.value, 10)))
  }

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setEditorUser(users.entities[parseInt(e.currentTarget.dataset.userId)])
    dispatch(openUserEditor())
  }

  // once per mount
  useEffect(() => {
    dispatch(fetchUsers())
  }, [dispatch])

  const rows = users.result.map((userId) => {
    const user = users.entities[userId]

    return (
      <tr key={userId}>
        {userId === curUserId && (
          <td translate='no'>
            <strong>{user.username}</strong>
            {' '}
            (
            {user.name}
            )
          </td>
        )}
        {userId !== curUserId && (
          <td>
            <a data-user-id={userId} onClick={handleOpen}>{user.username}</a>
            {' '}
            (
            {user.name}
            )
          </td>
        )}
        <td>{roleLabel(user.role, t)}</td>
        <td>{formatDateTime(new Date(user.dateCreated * 1000))}</td>
      </tr>
    )
  })

  const roomOpts = rooms.result
    .filter(roomId => !!rooms.entities[roomId].numUsers)
    .map(roomId => <option key={roomId} value={roomId}>{rooms.entities[roomId].name}</option>)

  const userFilter = (
    <select className={styles.usersFilter} onChange={handleFilterChange} value={filterOnline ? 'online' : filterRoomId || 'all'}>
      <option key='all' value='all'>{t('users.all')}</option>
      <option key='online' value='online'>{t('users.online')}</option>
      <optgroup label={t('users.onlineIn')}>
        {roomOpts}
      </optgroup>
    </select>
  )

  return (
    <Panel
      title={t('users.title')}
      titleComponent={userFilter}
    >
      <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('users.username')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.joined')}</th>
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>

        <br />
        <Button onClick={handleOpen} variant='primary'>
          {t('users.createUser')}
        </Button>

        {isEditorOpen && (
          <EditUser onClose={handleClose} user={editorUser} />
        )}
      </>
    </Panel>
  )
}

export default Users
