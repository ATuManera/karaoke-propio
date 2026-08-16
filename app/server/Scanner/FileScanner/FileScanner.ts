import path from 'path'
import getLogger from '../../lib/Log.js'
import { getExt, stripSourceIdSuffix } from '../../lib/util.js'
import getFiles from './getFiles.js'
import getConfig from './getConfig.js'
import Media from '../../Media/Media.js'
import { probeMedia, searchExts } from '../../Media/mediaResolver.js'
import { buildMediaFields, diffMediaFields, toRelPath } from '../../Media/mediaRecord.js'
import MetaParser from '../MetaParser/MetaParser.js'
import Scanner from '../Scanner.js'
import IPC from '../../lib/IPCBridge.js'
import { LIBRARY_MATCH_SONG, MEDIA_ADD, MEDIA_REMOVE, MEDIA_UPDATE } from '../../../shared/actionTypes.js'
const log = getLogger('FileScanner')

class FileScanner extends Scanner {
  paths: any
  parser: any

  constructor (prefs, qStats) {
    super(qStats)
    this.paths = prefs.paths
  }

  async scan (pathId) {
    const dir = this.paths.entities[pathId]?.path
    const validMediaIds = []
    const stats = { new: 0, removed: 0, existing: 0 }
    let files // { file, stats }[]
    let prevDir

    if (!dir) {
      log.error('invalid pathId: %s', pathId)
      return stats
    }

    log.info('Searching: %s', dir)
    this.emitStatus(`Searching: ${dir}`, 0)

    try {
      files = getFiles(dir, file => searchExts.includes(getExt(file)))

      log.info('  => found %s files with valid extensions %s',
        files.length.toLocaleString(),
        JSON.stringify(searchExts),
      )
    } catch (err) {
      log.error(`  => ${err.message} (path offline)`)
      return stats
    }

    for (let i = 0; i < files.length; i++) {
      const curDir = path.dirname(files[i].file)

      if (prevDir !== curDir) {
        prevDir = curDir

        // (re)init parser with this folder's config, if any
        const cfg = getConfig(curDir, dir)
        this.parser = MetaParser(cfg)
      }

      log.info('[%s/%s] %s', i + 1, files.length, files[i].file)
      this.emitStatus(`Scanning (${i + 1} of ${files.length})`, (i + 1) / files.length)

      // process file
      try {
        const res = await this.process(files[i], pathId)
        validMediaIds.push(res.mediaId)

        if (res.isNew) stats.new++
        else stats.existing++
      } catch (err) {
        log.warn(`  => ${err.message}`)
      }

      if (this.isCanceling) {
        this.emitStatus('Stopped', 100, false)
        return stats
      }
    } // end for

    log.info('Scanned %s valid media files', validMediaIds.length.toLocaleString())
    log.info('Searching for invalid media entries')

    const numRemoved = await this.removeInvalid(pathId, validMediaIds)
    stats.removed = numRemoved
    log.info(`Removed ${numRemoved} invalid media entries`)

    return stats
  }

  async process ({ file }, pathId) {
    // resolves audio/cdg/zip sources, probes duration + ReplayGain and derives
    // the content fingerprint from the very same buffer (single read)
    const probed = await probeMedia(file)

    log.verbose('  => duration: %s:%s',
      Math.floor(probed.duration / 60),
      Math.round(probed.duration % 60).toString().padStart(2, '0'),
    )

    // run MetaParser
    const pathInfo = path.parse(file)
    const parsed = this.parser({
      dir: pathInfo.dir,
      dirSep: path.sep,
      // same treatment point registration gives acquired files: the
      // "---<sourceId>" uniqueness suffix is a filesystem detail, never part
      // of the song's name. Without this a rescan would put the video id back
      // into every acquired song's title (see MediaRegistrar).
      name: stripSourceIdSuffix(pathInfo.name),
      meta: probed.meta,
    })

    // get artistId and songId
    const match = await (IPC as any).req({ type: LIBRARY_MATCH_SONG, payload: parsed })

    const relPath = toRelPath(file, this.paths.entities[pathId].path)
    const media = buildMediaFields(probed, match.songId, pathId, relPath)

    // file already in database?
    const res = Media.search({
      pathId,
      relPath: media.relPath,
    })

    log.verbose('  => %s db result(s)', res.result.length)

    if (res.result.length) {
      const row = res.entities[res.result[0]]
      const diff = diffMediaFields(media, row)

      if (Object.keys(diff).length) {
        await (IPC as any).req({
          type: MEDIA_UPDATE,
          payload: {
            mediaId: row.mediaId,
            dateUpdated: Math.round(new Date().getTime() / 1000), // seconds
            ...diff,
          },
        })

        log.info('  => updated: %s', Object.keys(diff).join(', '))
      } else {
        log.info('  => ok')
      }

      return { mediaId: row.mediaId, isNew: false }
    } // end if

    // new media
    ;(media as any).dateAdded = Math.round(new Date().getTime() / 1000) // seconds
    log.info('  => new: %s', JSON.stringify(match))

    return {
      mediaId: await (IPC as any).req({ type: MEDIA_ADD, payload: media }),
      isNew: true,
    }
  }

  async removeInvalid (pathId, validMediaIds = []) {
    const res = Media.search({ pathId })
    const invalid = res.result.filter(mediaId => !validMediaIds.includes(mediaId))

    if (invalid.length) {
      await (IPC as any).req({ type: MEDIA_REMOVE, payload: invalid })
    }

    return invalid.length
  }
}

export default FileScanner
