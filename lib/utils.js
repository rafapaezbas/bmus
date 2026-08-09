const fs = require('bare-fs')
const { extname, join } = require('bare-path')
const parseMp3 = require('dcent-beats/lib/parse-mp3.js')

function filterAudioFiles(path) {
  try {
    const entries = fs.readdirSync(path, { withFileTypes: true })

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

function readTrackMetadata(item) {
  try {
    return parseMp3(fs.readFileSync(join(item.path, item.name)))
  } catch {
    return null
  }
}

function searchAudioFiles(path) {
  try {
    const entries = fs.readdirSync(path, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => join(path, e.name))
    return [...filterAudioFiles(path), ...dirs.flatMap((dir) => searchAudioFiles(dir))]
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
  formatDuration
}
