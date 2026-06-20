const { join } = require('bare-path')
const {
  Program,
  quit,
  key,
  filepicker,
  style,
  spinner
} = require('@holepunchto/bare-tui')
const { filterMp3Files, Player, Preview, Playlist, createFoldersOnlyFs } = require('./lib/utils.js')

const PANEL = {
  FILEPICKER: 0,
  PREVIEW: 1,
  PLAYLIST: 2
}
const PANEL_COUNT = 3

const COLORS = {
  accent: '#00D7FF',
  border: '#44475A',
  muted: '#6272A4',
  pink: '#FF79C6'
}

const BOTTOM_PADDING = 7

class App {
  constructor() {
    this.player = new Player()
    this.width = 80
    this.height = 24
    this.fp = filepicker.create({ fs: createFoldersOnlyFs() })
    this.preview = new Preview()
    this.playlist = new Playlist()
    this.picked = null
    this.selectedPanel = PANEL.FILEPICKER
    this.spinner = spinner.create({ fps: 12 })
    this.currentDir = null
    this.isPlaying = false
    this.currentTrack = null
  }

  init() {
    return this.fp.init()
  }

  // ---- update ----

  update(msg) {
    switch (msg.type) {
      case 'filepicker.select':
        this.picked = msg.path
        return [this, null]

      case 'filepicker.entries':
        this.currentDir = msg.dir
        this._setPreviewItems(msg.dir)
        // the filepicker widget also needs this message to refresh
        // its own internal entry list
        return this._updateFp(msg)

      case 'resize':
        this._resize(msg.width, msg.height)
        return [this, null]

      case 'spinner.tick':
        return this._updateSpinner(msg)

      case 'key':
        if (key.matches(msg, 'ctrl+c')) return [this, quit]
        if (key.matches(msg, 'q') && this._activePanel() !== PANEL.PLAYLIST) return [this, quit]
        if (key.matches(msg, 'tab')) {
          this.selectedPanel++
          return [this, null]
        }
        break
    }

    return this._updateActivePanel(msg)
  }

  _updateActivePanel(msg) {
    switch (this._activePanel()) {
      case PANEL.FILEPICKER:
        return this._updateFp(msg)

      case PANEL.PREVIEW:
        if (key.matches(msg, 'enter')) {
          this._playSelected()
          return [this, null]
        }
        if (key.matches(msg, 'a')) {
          this._addSelectedToPlaylist()
          return [this, null]
        }
        return this.preview.update(msg)

      case PANEL.PLAYLIST:
        if (key.matches(msg, 'q')) {
          this.playlist.removeSelected()
          return [this, null]
        }
        return this.playlist.update(msg)

      default:
        return [this, null]
    }
  }

  _addSelectedToPlaylist() {
    const track = this.preview.list.selectedItem()
    if (!track) return

    this.playlist.addTrack(track)
  }

  _activePanel() {
    return this.selectedPanel % PANEL_COUNT
  }

  _playSelected() {
    const track = this.preview.list.selectedItem()
    const path = join(this.currentDir, track)

    this.isPlaying = true
    this.currentTrack = track
    this.player.stop()
    this.player.play(path)
  }

  _updateFp(msg) {
    const [fp, cmd] = this.fp.update(msg)
    this.fp = fp
    return [this, cmd]
  }

  _updateSpinner(msg) {
    const [s, cmd] = this.spinner.update(msg)
    this.spinner = s
    return [this, cmd]
  }

  _setPreviewItems(path) {
    this.preview.list.setItems(filterMp3Files(path))
  }

  _resize(width, height) {
    this.width = width
    this.height = height

    const panelHeight = this._contentHeight()

    this.fp.width = width / 6
    this.fp.height = panelHeight

    this.preview.list.width = (width / 6) * 2 - 8
    this.preview.list.height = panelHeight

    this.playlist.list.width = (width / 6) * 2
    this.playlist.list.height = panelHeight - 2
  }

  _contentHeight() {
    return this.height - BOTTOM_PADDING - 1
  }

  // ---- view ----

  view() {
    const body = style.joinHorizontal(
      style.position.top,
      this._renderFilepicker(),
      ' ',
      this._renderPreview(),
      ' ',
      this._renderPlaylist()
    )

    return style.joinVertical(
      style.position.left,
      this._renderHeader(),
      body,
      ' ',
      this._renderFooter()
    )
  }

  _panelBorderColor(panel) {
    return this._activePanel() === panel ? COLORS.accent : COLORS.border
  }

  _renderFilepicker() {
    return style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.FILEPICKER))
      .padding(0, 1)
      .width(this.width / 6)
      .height(this.height - BOTTOM_PADDING)
      .render(this.fp.view())
  }

  _renderPreview() {
    const width = (this.width / 6) * 2 - 8
    const height = this.height - BOTTOM_PADDING

    const content = this.preview.list.items.length
      ? this.preview.view(this.width / 2, height)
      : style().foreground(COLORS.muted).italic(true).render('No mp3 files here')

    return style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.PREVIEW))
      .padding(0, 1)
      .width(width)
      .height(height)
      .render(content)
  }

  _renderPlaylist() {
    const width = (this.width / 6) * 3 - 5
    const height = this.height - BOTTOM_PADDING

    return style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.PLAYLIST))
      .padding(0, 1)
      .width(width)
      .height(height)
      .render(this.playlist.view((this.width / 6) * 3 - 6, height))
  }

  _renderHeader() {
    const logo = style().foreground(COLORS.pink).bold(true).render('♫ bare-tui-player')
    const version = style().foreground(COLORS.border).render('v1.0.0')
    const nowPlaying = this._renderHeaderNowPlaying()

    return style()
      .border(style.borders.rounded)
      .borderForeground(COLORS.border)
      .width(this.width - 2)
      .render(style.joinHorizontal(style.position.top, logo, '  ', version, '   ', nowPlaying))
  }

  _renderHeaderNowPlaying() {
    if (this.isPlaying && this.currentTrack) {
      return (
        style().foreground(COLORS.muted).render('playing: ') +
        style().foreground(COLORS.accent).render(this.currentTrack)
      )
    }

    return style()
      .foreground(COLORS.border)
      .render('─'.repeat(Math.max(0, this.width - 24)))
  }

  _renderFooter() {
    const keys = style()
      .foreground(COLORS.muted)
      .render('  ↑/↓ move · ↵ play · a add to playlist · q remove/quit · tab switch')

    const nowPlaying =
      this.isPlaying && this.currentTrack
        ? style().foreground(COLORS.pink).bold(true).render('♪ ' + this.currentTrack)
        : style().foreground(COLORS.border).render('nothing playing')

    return style.joinHorizontal(style.position.top, keys, '   ', nowPlaying)
  }
}

new Program(new App()).run()
