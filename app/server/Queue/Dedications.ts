import { db } from '../lib/Database.js'
import sql from 'sqlate'
import { sanitizeDedication } from '../../shared/dedication.js'
import type { Dedication } from '../../shared/types.js'

/**
 * What gets said over a song while it plays: the singer's own dedication, and
 * any message an admin put over that same performance.
 *
 * Everything is keyed by queueId (see migration 016), so a message lives and
 * dies with the performance it belongs to. Nothing here touches playback —
 * the carousel on the player is the only thing that reads it.
 */
class Dedications {
  /**
   * Every message on every entry of one room's queue, keyed by queueId.
   *
   * Deliberately a second query rather than a join onto Queue.get(): that one
   * is a GROUP BY over media rows with MAX(isPreferred) deciding which
   * recording plays, and multiplying its rows by a one-to-many join would
   * quietly change that answer. Which version airs must not depend on how
   * many people wrote something about it.
   */
  static getForRoom (roomId: number): Record<number, Dedication[]> {
    const query = sql`
      SELECT dedications.dedicationId, dedications.queueId, dedications.userId,
        dedications.text, dedications.dateUpdated,
        users.name AS userDisplayName
      FROM dedications
        INNER JOIN queue USING(queueId)
        INNER JOIN users ON users.userId = dedications.userId
      WHERE queue.roomId = ${roomId}
      ORDER BY dedications.dedicationId ASC
    `
    const rows = db.all<Dedication>(String(query), query.parameters)
    const byQueueId: Record<number, Dedication[]> = {}

    for (const row of rows) {
      byQueueId[row.queueId] ??= []
      byQueueId[row.queueId].push(row)
    }

    return byQueueId
  }

  /** One message, for the permission checks that need to know whose it is. */
  static getRow (dedicationId: number): { dedicationId: number, queueId: number, userId: number } | undefined {
    const query = sql`
      SELECT dedicationId, queueId, userId
      FROM dedications
      WHERE dedicationId = ${dedicationId}
    `
    return db.get(String(query), query.parameters)
  }

  /**
   * Write what `userId` has to say about `queueId`, replacing whatever they
   * said before (one message per person per performance — see migration 016).
   *
   * An empty message is not an error: it is how the author takes theirs down,
   * so Save on a cleared box does the obvious thing without a second gesture.
   * Returns false when there was nothing to remove.
   */
  static set ({ queueId, userId, text }: { queueId: number, userId: number, text: string }): boolean {
    const clean = sanitizeDedication(text)

    if (clean === '') {
      return Dedications.removeByAuthor({ queueId, userId })
    }

    const now = Math.floor(Date.now() / 1000)
    const query = sql`
      INSERT INTO dedications (queueId, userId, text, dateCreated, dateUpdated)
      VALUES (${queueId}, ${userId}, ${clean}, ${now}, ${now})
      ON CONFLICT (queueId, userId) DO UPDATE SET
        text = excluded.text,
        dateUpdated = excluded.dateUpdated
    `
    return db.run(String(query), query.parameters).changes === 1
  }

  /**
   * Rewrite an existing message in place, leaving its author alone: an admin
   * fixing a name in someone's dedication is correcting what that singer said,
   * not signing it themselves.
   */
  static update ({ dedicationId, text }: { dedicationId: number, text: string }): boolean {
    const clean = sanitizeDedication(text)

    if (clean === '') {
      return Dedications.remove(dedicationId)
    }

    const query = sql`
      UPDATE dedications
      SET text = ${clean}, dateUpdated = ${Math.floor(Date.now() / 1000)}
      WHERE dedicationId = ${dedicationId}
    `
    return db.run(String(query), query.parameters).changes === 1
  }

  static remove (dedicationId: number): boolean {
    const query = sql`
      DELETE FROM dedications
      WHERE dedicationId = ${dedicationId}
    `
    return db.run(String(query), query.parameters).changes === 1
  }

  static removeByAuthor ({ queueId, userId }: { queueId: number, userId: number }): boolean {
    const query = sql`
      DELETE FROM dedications
      WHERE queueId = ${queueId} AND userId = ${userId}
    `
    return db.run(String(query), query.parameters).changes === 1
  }
}

export default Dedications
