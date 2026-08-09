// Headless MCP server for bmus. Owns the audio device and the queue for the
// lifetime of this process — playback stops when the client disconnects.
const process = require('bare-process')
const fs = require('bare-fs')
const { join, dirname, basename, resolve, extname } = require('bare-path')
const pkg = require('./package.json')
const { McpServer } = require('./lib/mcp.js')
const { filterAudioFiles, searchAudioFiles, formatDuration } = require('./lib/utils.js')
const Player = require('./lib/player.js')

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac']

const player = new Player(
  () => player.next(), // auto-advance; there is no UI to notify
  (e, track) => process.stderr.write(`bmus-mcp: cannot play ${track.name}: ${e.message || e}\n`)
)

const server = new McpServer({
  name: pkg.name,
  version: pkg.version,
  stdin: process.stdin,
  stdout: process.stdout,
  instructions:
    'Controls the bmus audio player. Browse the filesystem for audio files, add them to ' +
    'the queue, and control playback. Playback lasts only while this server is running.'
})

server.tool('now_playing', {
  description: 'Report the currently playing track, queue length, and shuffle state.',
  inputSchema: { type: 'object', properties: {} },
  handler: () => {
    const current = player.current
    const lines = [
      current
        ? `Playing: ${describe(current)} (queue position ${player.currentIndex + 1})`
        : 'Nothing playing',
      `Queue: ${player.playlist.length} track(s)`,
      `Shuffle: ${player.random ? 'on' : 'off'}`
    ]
    return lines.join('\n')
  }
})

server.tool('queue_list', {
  description:
    'List the queued tracks in order, with the index of each. Use these indices with play and queue_remove.',
  inputSchema: { type: 'object', properties: {} },
  handler: () => {
    if (player.playlist.length === 0) return 'The queue is empty.'
    return player.playlist
      .map((track, i) => `${i}${i === player.currentIndex ? ' *' : ' '} ${describe(track)}`)
      .join('\n')
  }
})

server.tool('queue_add', {
  description:
    'Add audio files to the end of the queue. Each path may be an audio file or a directory ' +
    '(every audio file directly inside it is added, not recursively).',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Absolute paths to audio files or directories.'
      }
    },
    required: ['paths']
  },
  handler: async ({ paths }) => {
    const resolved = await Promise.all(requireArray(paths, 'paths').map((p) => tracksAtPath(p)))
    const tracks = resolved.flat()
    if (tracks.length === 0) return 'No audio files found at those paths.'
    for (const track of tracks) player.add(track)
    return `Added ${tracks.length} track(s). Queue now has ${player.playlist.length}.`
  }
})

server.tool('queue_remove', {
  description: 'Remove one track from the queue by its index (see queue_list).',
  inputSchema: {
    type: 'object',
    properties: { index: { type: 'integer', description: 'Index from queue_list.' } },
    required: ['index']
  },
  handler: ({ index }) => {
    const i = requireIndex(index)
    const track = player.playlist[i]
    if (!track) throw new Error(`No track at index ${i}. The queue has ${player.playlist.length}.`)
    const wasPlaying = i === player.currentIndex
    player.remove(i)
    return wasPlaying
      ? `Removed ${describe(track)} and stopped playback (it was the playing track).`
      : `Removed ${describe(track)}.`
  }
})

server.tool('queue_clear', {
  description: 'Remove every track from the queue and stop playback.',
  inputSchema: { type: 'object', properties: {} },
  handler: () => {
    player.clear()
    return 'Queue cleared.'
  }
})

server.tool('play', {
  description:
    'Start playing a queued track. Give either an index from queue_list or a search string ' +
    'matched against queued track names; with neither, resume the current track or start at the beginning.',
  inputSchema: {
    type: 'object',
    properties: {
      index: { type: 'integer', description: 'Index from queue_list.' },
      track: { type: 'string', description: 'Case-insensitive substring of a queued track.' }
    }
  },
  handler: ({ index, track }) => {
    if (player.playlist.length === 0) throw new Error('The queue is empty — add tracks first.')

    const i = resolveIndex(index, track)
    player.play(i)
    return `Playing ${describe(player.playlist[i])}.`
  }
})

server.tool('stop', {
  description: 'Stop playback. The queue is left as it is.',
  inputSchema: { type: 'object', properties: {} },
  handler: () => {
    player.stop()
    return 'Stopped.'
  }
})

server.tool('next', {
  description: 'Skip to the next track — the following one, or a random one when shuffle is on.',
  inputSchema: { type: 'object', properties: {} },
  handler: () => {
    if (player.playlist.length === 0) throw new Error('The queue is empty — add tracks first.')
    player.next()
    return `Playing ${describe(player.current)}.`
  }
})

server.tool('set_shuffle', {
  description:
    'Turn shuffle on or off. Shuffle picks a random next track instead of the next in order.',
  inputSchema: {
    type: 'object',
    properties: { enabled: { type: 'boolean' } },
    required: ['enabled']
  },
  handler: ({ enabled }) => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be true or false.')
    if (player.random !== enabled) player.toggleRandom()
    return `Shuffle is ${player.random ? 'on' : 'off'}.`
  }
})

server.tool('browse_directory', {
  description:
    'List the sub-directories and audio files directly inside a directory. Use this to explore a music library.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Absolute path to a directory.' } },
    required: ['path']
  },
  handler: async ({ path }) => {
    const dir = requireDirectory(path)
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => `${join(dir, e.name)}/`)
      .sort()
    const files = (await filterAudioFiles(dir)).map((track) => join(track.path, track.name))
    if (dirs.length === 0 && files.length === 0) {
      return `${dir} has no sub-directories or audio files.`
    }
    return [...dirs, ...files].join('\n')
  }
})

server.tool('search_library', {
  description:
    'Search a directory tree for audio files, optionally filtering by a substring of the filename. ' +
    'This walks every sub-directory, so it can be slow on a large library.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the directory to search.' },
      query: { type: 'string', description: 'Case-insensitive substring of the filename.' },
      limit: { type: 'integer', description: 'Maximum results to return (default 100).' }
    },
    required: ['path']
  },
  handler: async ({ path, query, limit }) => {
    const dir = requireDirectory(path)
    const needle = typeof query === 'string' ? query.toLowerCase() : null
    const max = Number.isInteger(limit) && limit > 0 ? limit : 100

    const matches = (await searchAudioFiles(dir)).filter(
      (track) => needle === null || track.name.toLowerCase().includes(needle)
    )
    if (matches.length === 0) return 'No matching audio files.'

    const shown = matches.slice(0, max).map((track) => join(track.path, track.name))
    const suffix = matches.length > max ? `\n(${matches.length - max} more not shown)` : ''
    return shown.join('\n') + suffix
  }
})

function describe(track) {
  if (!track) return 'nothing'
  const common = track.metadata?.common || {}
  const format = track.metadata?.format || {}
  const title = common.title || track.name
  const label = common.artist ? `${common.artist} - ${title}` : title
  const duration = Number.isFinite(format.duration) ? ` (${formatDuration(format.duration)})` : ''
  return `${label}${duration}`
}

async function tracksAtPath(path) {
  const full = resolve(String(path))
  let stat = null
  try {
    stat = await fs.promises.stat(full)
  } catch {
    throw new Error(`No such file or directory: ${full}`)
  }

  if (stat.isDirectory()) return await filterAudioFiles(full)

  if (!AUDIO_EXTENSIONS.includes(extname(full).toLowerCase())) {
    throw new Error(`Not an audio file: ${full}`)
  }
  return [{ path: dirname(full), name: basename(full) }]
}

function resolveIndex(index, track) {
  if (index !== undefined) {
    const i = requireIndex(index)
    if (!player.playlist[i]) {
      throw new Error(`No track at index ${i}. The queue has ${player.playlist.length}.`)
    }
    return i
  }

  if (typeof track === 'string' && track.trim()) {
    const needle = track.toLowerCase()
    const i = player.playlist.findIndex((t) => describe(t).toLowerCase().includes(needle))
    if (i === -1) throw new Error(`No queued track matches "${track}".`)
    return i
  }

  return player.currentIndex >= 0 ? player.currentIndex : 0
}

function requireIndex(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('index must be a non-negative integer.')
  }
  return index
}

function requireArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array.`)
  }
  return value
}

function requireDirectory(path) {
  const full = resolve(String(path))
  let stat = null
  try {
    stat = fs.statSync(full)
  } catch {
    throw new Error(`No such directory: ${full}`)
  }
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${full}`)
  return full
}

let closed = false

async function teardown() {
  if (closed) return
  closed = true

  // Let in-flight requests finish so their responses still reach the client,
  // but never hang the shutdown on a handler that misbehaves.
  await Promise.race([server.drain(), new Promise((resolve) => setTimeout(resolve, 2000))])

  try {
    player.stop()
  } catch {
    // the device may never have opened; nothing to stop
  }
  process.exit(0)
}

process.stdin.on('end', teardown)
process.stdin.on('close', teardown)
process.on('SIGINT', teardown)
process.on('SIGTERM', teardown)

// stdout is the protocol channel — diagnostics must go to stderr only
player.ready().catch((e) => {
  process.stderr.write(`bmus-mcp: audio device unavailable: ${e.message}\n`)
})

server.listen()
