const fs = require('bare-fs')
const { extname, join } = require('bare-path')
const parseMp3 = require('dcent-beats/lib/parse-mp3.js')

async function filterAudioFiles(path) {
  try {
    const entries = await fs.promises.readdir(path, { withFileTypes: true })
    return filterAudioEntries(entries, path)
  } catch {
    return []
  }
}

function filterAudioEntries(entries, path) {
  try {
    return entries
      .filter((entry) => {
        if (!entry.isFile()) return false
        const ext = extname(entry.name).toLowerCase()
        return ext === '.mp3' || ext === '.wav' || ext === '.flac'
      })
      .map((entry) => ({ path: path, name: entry.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  } catch {
    return []
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function readTrackMetadata(item) {
  try {
    return parseMp3(await fs.promises.readFile(join(item.path, item.name)))
  } catch {
    return null
  }
}

async function searchAudioFiles(path) {
  try {
    const entries = await fs.promises.readdir(path, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => join(path, e.name))
    const nested = await Promise.all(dirs.map((dir) => searchAudioFiles(dir)))
    return [...filterAudioEntries(entries, path), ...nested.flat()]
  } catch {
    return []
  }
}

function formatDuration(seconds) {
  const totalSeconds = Math.round(parseFloat(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function createFoldersOnlyFs() {
  return {
    readdir(dir, opts, cb) {
      fs.readdir(dir, opts, (err, entries) => {
        if (err) return cb(err)
        const filtered = entries.filter((entry) => {
          return entry.isDirectory()
        })
        cb(null, filtered)
      })
    }
  }
}

module.exports = {
  filterAudioFiles,
  searchAudioFiles,
  createFoldersOnlyFs,
  readTrackMetadata,
  formatDuration,
  mapLimit
}
