const { Program, quit, key, filepicker, batch } = require('bare-tui')
const updaterWidget = require('bare-tui-updater')
const { wire } = require('bare-tui-updater/pear')
const {
  filterAudioFiles,
  searchAudioFiles,
  createFoldersOnlyFs,
  readTrackMetadata,
  mapLimit
} = require('./lib/utils.js')
const { TextInput, Preview, Playlist } = require('./lib/gui.js')
const { render, layout, PANEL, PANEL_COUNT } = require('./lib/view.js')
const Player = require('./lib/player.js')

let program = null
global.debug = ''

const METADATA_CONCURRENCY = 8

class App {
  constructor(opts = {}) {
    this.preview = new Preview()
    this.playlist = new Playlist()
    this.textInput = new TextInput()
    this.player = new Player(() => program.send({ type: 'track.ended' }))
    this.width = undefined
    this.height = undefined
    this.fp = filepicker.create({ fs: createFoldersOnlyFs() })
    this.selectedPanel = PANEL.FILEPICKER
    this.currentDir = null
    this.debug = ''
    this.teardown = opts.teardown

    this.updater = opts.updater
    this.updateWidget = opts.updater
      ? updaterWidget.create({
          onAccept: async () => {
            await this.updater.applyUpdate()
          }
        })
      : null

    this.timer = setInterval(() => {
      program.send({ type: 'timer.tick' })
    }, 1000)
    this.secs = 0
    this._registerCommands()
  }

  init() {
    this.player.ready()
    return this.fp.init()
  }

  _registerCommands() {
    this.textInput.registerCommand('add-all', async () => {
      const entries = await mapLimit(this.preview.items, METADATA_CONCURRENCY, async (e) => {
        return { ...e, metadata: await readTrackMetadata(e) }
      })
      return { type: 'playlist.entries', entries }
    })
    this.textInput.registerCommand('clear', () => {
      return { type: 'playlist.entries', entries: [] }
    })
    this.textInput.registerCommand('search', async () => {
      const dir = this.currentDir // capture, it can change while the search runs
      const entries = await searchAudioFiles(dir)
      return { type: 'preview.entries', dir, entries }
    })
  }

  update(msg) {
    if (this.updateWidget) {
      const [w, cmd] = this.updateWidget.update(msg)
      this.updateWidget = w
      if (cmd) return [this, cmd]
    }

    switch (msg.type) {
      case 'filepicker.select':
        return [this, null]

      case 'filepicker.entries': {
        const [, cmd] = this.fp.update(msg)
        if (msg.dir !== this.fp.cwd) return [this, cmd]
        this.currentDir = msg.dir
        return [this, batch([cmd, this._listPreviewEntries(msg)])]
      }

      case 'playlist.entries':
        if (msg.entries.length === 0) {
          this.player.clear()
        } else {
          msg.entries.forEach((e) => this.player.add(e))
        }
        this._refreshLists()
        return [this, null]

      case 'playlist.add':
        this.player.add(msg.track)
        this._refreshLists()
        return [this, null]

      case 'preview.entries':
        if (msg.dir !== this.currentDir) return [this, null] // stale, we moved on
        this.preview.items = msg.entries
        this.preview.refresh(this.player.current)
        return [this, null]

      case 'track.ended':
        this.player.next()
        this._refreshLists()
        return [this, null]

      case 'resize': {
        this.width = msg.width
        this.height = msg.height - 2 // updater padding

        const { panelHeight, filepickerWidth, previewWidth, playlistWidth } = layout(this)
        this.fp.width = filepickerWidth
        this.fp.height = panelHeight - 1
        this.preview.list.width = previewWidth
        this.preview.list.height = panelHeight
        this.playlist.list.width = playlistWidth
        this.playlist.list.height = panelHeight
        return [this, null]
      }

      case 'key':
        return this._updateKey(msg)

      case 'timer.tick':
        this.secs++
        return

      default:
        return [this, null]
    }
  }

  _updateKey(msg) {
    if (key.matches(msg, 'ctrl+c')) {
      clearInterval(this.timer)
      this.player.stop()
      this.teardown()
      return [this, quit]
    }

    // shift+tab also matches 'tab', so it has to be checked first
    if (key.matches(msg, 'shift+tab')) this._cyclePanel(-1)
    else if (key.matches(msg, 'tab')) this._cyclePanel(1)

    // the key is then handed to the panel we just switched to
    switch (this.selectedPanel) {
      case PANEL.FILEPICKER:
        return this._filepickerKey(msg)

      case PANEL.PREVIEW:
        return this._previewKey(msg)

      case PANEL.PLAYLIST:
        return this._playlistKey(msg)

      case PANEL.TEXT_INPUT:
        return this._textInputKey(msg)

      default:
        return [this, null]
    }
  }

  _listPreviewEntries(msg) {
    return async () => {
      return {
        type: 'preview.entries',
        dir: msg.dir,
        entries: await filterAudioFiles(msg.dir)
      }
    }
  }

  _filepickerKey(msg) {
    const [, cmd] = this.fp.update(msg) // the filepicker updates in place
    return [this, cmd]
  }

  _previewKey(msg) {
    if (key.matches(msg, 'a')) {
      const track = this.preview.items[this.preview.list.selected]
      if (track) return [this, this._addTrackCmd(track)]
    }
    return [this, this.preview.update(msg)]
  }

  _playlistKey(msg) {
    const selected = this.playlist.list.selected
    if (key.matches(msg, 'enter')) {
      this.secs = 0
      this.player.play(selected)
    }
    if (key.matches(msg, 'n')) this.player.next()
    if (key.matches(msg, 'q')) this.player.remove(selected)
    if (key.matches(msg, 'r')) this.player.toggleRandom()
    this._refreshLists()
    return [this, this.playlist.update(msg)]
  }

  _textInputKey(msg) {
    if (key.matches(msg, 'enter')) return [this, () => this.textInput.submit(msg)]
    return [this, this.textInput.update(msg)]
  }

  _addTrackCmd(track) {
    return async () => ({
      type: 'playlist.add',
      track: { ...track, metadata: await readTrackMetadata(track) }
    })
  }

  _cyclePanel(delta) {
    this.selectedPanel = (this.selectedPanel + delta + PANEL_COUNT) % PANEL_COUNT
  }

  _refreshLists() {
    this.playlist.refresh(this.player.playlist, this.player.currentIndex)
    this.preview.refresh(this.player.current)
  }

  view() {
    return render(this)
  }
}

module.exports = (teardown, updater) => {
  const app = new App({ teardown, updater })
  program = new Program(app)
  if (app.updateWidget && updater) {
    wire(app.updateWidget, { updater, send: program.send.bind(program) })
  }
  return program.run()
}
