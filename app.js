const { Program, quit, key, filepicker, style, batch } = require('bare-tui')
const updaterWidget = require('bare-tui-updater')
const { wire } = require('bare-tui-updater/pear')
const pkg = require('./package.json')
const {
  filterAudioFiles,
  searchAudioFiles,
  createFoldersOnlyFs,
  readTrackMetadata,
  mapLimit
} = require('./lib/utils.js')
const { TextInput, Preview, Playlist } = require('./lib/gui.js')
const Player = require('./lib/player.js')

let program = null
global.debug = ''

const PANEL_COUNT = 4
const BOTTOM_PADDING = 10
const METADATA_CONCURRENCY = 8

const PANEL = {
  FILEPICKER: 0,
  PREVIEW: 1,
  PLAYLIST: 2,
  TEXT_INPUT: 3
}

const COLORS = {
  accent: '#00D7FF',
  border: '#44475A',
  muted: '#6272A4',
  pink: '#FF79C6'
}

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
        return [
          this,
          batch([
            cmd,
            async () => {
              return {
                type: 'preview.entries',
                dir: msg.dir,
                entries: await filterAudioFiles(msg.dir)
              }
            }
          ])
        ]
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

        const { panelHeight, filepickerWidth, previewWidth, playlistWidth } = this._layout()
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

      default:
        return [this, null]
    }
  }

  _updateKey(msg) {
    if (key.matches(msg, 'ctrl+c')) {
      this.player.stop()
      this.teardown()
      return [this, quit]
    }

    // shift+tab also matches 'tab', so it has to be checked first
    if (key.matches(msg, 'shift+tab')) this._cyclePanel(-1)
    else if (key.matches(msg, 'tab')) this._cyclePanel(1)

    switch (this.selectedPanel) {
      case PANEL.FILEPICKER:
        return this._updateFp(msg)

      case PANEL.PREVIEW: {
        if (key.matches(msg, 'a')) {
          const track = this.preview.items[this.preview.list.selected]
          if (track) {
            return [
              this,
              async () => ({
                type: 'playlist.add',
                track: { ...track, metadata: await readTrackMetadata(track) }
              })
            ]
          }
        }
        return [this, this.preview.update(msg)]
      }

      case PANEL.PLAYLIST: {
        const selected = this.playlist.list.selected
        if (key.matches(msg, 'enter')) this.player.play(selected)
        if (key.matches(msg, 'n')) this.player.next()
        if (key.matches(msg, 'q')) this.player.remove(selected)
        if (key.matches(msg, 'r')) this.player.toggleRandom()
        this._refreshLists()
        return [this, this.playlist.update(msg)]
      }

      case PANEL.TEXT_INPUT:
        if (key.matches(msg, 'enter')) {
          const cmd = () => this.textInput.submit(msg)
          return [this, cmd]
        }
        return [this, this.textInput.update(msg)]

      default:
        return [this, null]
    }
  }

  _cyclePanel(delta) {
    this.selectedPanel = (this.selectedPanel + delta + PANEL_COUNT) % PANEL_COUNT
  }

  _refreshLists() {
    this.playlist.refresh(this.player.playlist, this.player.currentIndex)
    this.preview.refresh(this.player.current)
  }

  _updateFp(msg) {
    const [, cmd] = this.fp.update(msg) // the filepicker updates in place
    return [this, cmd]
  }

  view() {
    const parts = [
      this._renderHeader(),
      this._renderBody(),
      this._renderTextInput(),
      this.updateWidget ? this.updateWidget.view() : '',
      this._renderFooter()
    ].filter(Boolean)
    return style.joinVertical(style.position.left, ...parts)
  }

  _layout() {
    const column = this.width / 6
    return {
      panelHeight: this.height - BOTTOM_PADDING - 1,
      filepickerWidth: column,
      previewWidth: column * 2 - 8,
      playlistWidth: column * 3
    }
  }

  _panelBox(panel, label, content, width, height) {
    const box = style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(panel))
      .padding(0, 1)
      .width(width)
      .height(height)
      .render(content)

    return style.joinVertical(style.position.left, this._sectionLabel(label, panel), box)
  }

  _panelBorderColor(panel) {
    return this.selectedPanel === panel ? COLORS.accent : COLORS.border
  }

  _sectionLabel(text, panel) {
    return style()
      .foreground(this._panelBorderColor(panel))
      .bold(true)
      .render(' ' + text)
  }

  _countLabel(text, count) {
    return count ? `${text} (${count})` : text
  }

  _renderHeader() {
    const logo = style().foreground(COLORS.pink).bold(true).render('♫ bmus')
    const version = style()
      .foreground(COLORS.border)
      .render('v' + pkg.version)

    return style()
      .border(style.borders.rounded)
      .borderForeground(COLORS.border)
      .width(this.width - 2)
      .render(
        style.joinHorizontal(
          style.position.top,
          logo,
          '  ',
          version,
          '   ',
          this._renderHeaderNowPlaying()
        )
      )
  }

  _renderHeaderNowPlaying() {
    const current = this.player.current
    if (current) {
      return (
        style().foreground(COLORS.muted).render('playing: ') +
        style().foreground(COLORS.accent).render(current.name)
      )
    }

    return style()
      .foreground(COLORS.border)
      .render('─'.repeat(Math.max(0, this.width - 24)))
  }

  _renderBody() {
    const menu = this.textInput.input.menuView()
    const menuLines = menu ? menu.split('\n').length : 0

    return style()
      .height(this.height - BOTTOM_PADDING + 2 - menuLines)
      .render(
        style.joinHorizontal(
          style.position.top,
          ' ',
          this._renderFilepicker(),
          this._renderPreview(),
          this._renderPlaylist()
        )
      )
  }

  _renderFilepicker() {
    const { panelHeight, filepickerWidth } = this._layout()

    return this._panelBox(PANEL.FILEPICKER, 'Library', this.fp.view(), filepickerWidth, panelHeight)
  }

  _renderPreview() {
    const { panelHeight, previewWidth } = this._layout()

    const content = this.preview.list.items.length
      ? this.preview.view(this.width / 2, panelHeight)
      : style().foreground(COLORS.muted).italic(true).render('No audio files here')

    const label = this._countLabel('Track', this.preview.items.length)
    return this._panelBox(PANEL.PREVIEW, label, content, previewWidth, panelHeight)
  }

  _renderPlaylist() {
    const { panelHeight, playlistWidth } = this._layout()

    const content = this.playlist.view(playlistWidth - 6, panelHeight)
    const label = this._countLabel('Queue', this.playlist.list.items.length)
    return this._panelBox(PANEL.PLAYLIST, label, content, playlistWidth - 5, panelHeight)
  }

  _renderTextInput() {
    return style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.TEXT_INPUT))
      .width(this.width - 2)
      .render(this.textInput.view())
  }

  _renderFooter() {
    const keys = style()
      .foreground(COLORS.muted)
      .render('  ' + this._footerHint())

    const current = this.player.current
    const nowPlaying = current
      ? style()
          .foreground(COLORS.pink)
          .bold(true)
          .render('♪ ' + current.name)
      : style().foreground(COLORS.border).render('nothing playing')

    return style.joinHorizontal(
      style.position.top,
      keys,
      '   ',
      nowPlaying,
      ' ',
      this.player.random ? 'Random' : '',
      ' ',
      global.debug
    )
  }

  _footerHint() {
    switch (this.selectedPanel) {
      case PANEL.FILEPICKER:
        return '↑/↓ move · ↵/→ open · ⌫/← up · tab switch'
      case PANEL.PREVIEW:
        return '↑/↓ move · a add to playlist · tab switch'
      case PANEL.PLAYLIST:
        return '↑/↓ move · ↵ play · q remove · n next · tab switch · r random · ctrl+c quit'
      default:
        return 'tab switch'
    }
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
