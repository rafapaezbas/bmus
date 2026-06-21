const { join, basename } = require('bare-path')
const { Program, quit, key, filepicker, style } = require('@holepunchto/bare-tui')
const {
  filterMp3Files,
  Player,
  Preview,
  Playlist,
  createFoldersOnlyFs,
  TextInput
} = require('./lib/utils.js')

const PANEL = {
  FILEPICKER: 0,
  PREVIEW: 1,
  PLAYLIST: 2,
  TEXT_INPUT: 3
}
const PANEL_COUNT = 4

const COLORS = {
  accent: '#00D7FF',
  border: '#44475A',
  muted: '#6272A4',
  pink: '#FF79C6'
}

const BOTTOM_PADDING = 10

class App {
  constructor() {
    this.player = new Player()
    this.preview = new Preview()
    this.playlist = new Playlist()
    this.textInput = new TextInput()
    this.width = undefined
    this.height = undefined
    this.fp = filepicker.create({ fs: createFoldersOnlyFs() })
    this.picked = null
    this.selectedPanel = PANEL.FILEPICKER
    this.currentDir = null
    this.previewTrackNames = []
    this.isPlaying = false
    this.currentTrack = { label: null, path: null }
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
        return this._updateFp(msg)

      case 'resize':
        this._resize(msg.width, msg.height)
        return [this, null]

      case 'key':
        if (key.matches(msg, 'ctrl+c')) {
          this.player.stop()
          return [this, quit]
        }
        if (key.matches(msg, 'tab')) this.selectedPanel++
        return this._updateActivePanel(msg)
    }
  }

  _updateActivePanel(msg) {
    switch (this._activePanel()) {
      case PANEL.FILEPICKER:
        return this._updateFp(msg)

      case PANEL.PREVIEW:
        if (key.matches(msg, 'a')) {
          this._addSelectedToPlaylist()
        }
        return [this, this.preview.update(msg)]

      case PANEL.PLAYLIST:
        if (key.matches(msg, 'enter')) {
          this._playSelectedFromPlaylist()
        }
        if (key.matches(msg, 'n')) {
          this._playNext()
        }
        if (key.matches(msg, 'q')) {
          this.playlist.removeSelected()
        }
        return [this, this.playlist.update(msg)]

      case PANEL.TEXT_INPUT:
        if (key.matches(msg, 'enter')) {
          this.textInput.submit()
        }
        return this.textInput.update(msg)

      default:
        return [this, null]
    }
  }

  _addSelectedToPlaylist() {
    const track = this._selectedPreviewTrackName()
    if (!track) return

    const path = join(this.currentDir, track)
    this.playlist.addTrack(path)
  }

  _selectedPreviewTrackName() {
    const selected = this.preview.list.selectedItem()
    if (!selected) return null
    return selected
  }

  _activePanel() {
    return this.selectedPanel % PANEL_COUNT
  }

  _playSelectedFromPlaylist() {
    const path = this.playlist.list.selectedItem()
    if (!path) return
    this._play(path)
  }

  _play(path) {
    this.isPlaying = true
    this.currentTrack = { label: basename(path), path }
    this.player.play(path)
  }

  _playNext() {
    const nextTrackIndex =
      (this.playlist.items.indexOf(this.currentTrack.path) + 1) % this.playlist.items.length
    const nextTrack = this.playlist.items[nextTrackIndex]
    this._play(nextTrack)
  }

  _updateFp(msg) {
    const [fp, cmd] = this.fp.update(msg)
    this.fp = fp
    return [this, cmd]
  }

  _setPreviewItems(path) {
    this.previewTrackNames = filterMp3Files(path)
    this._refreshPreviewDisplay()
  }

  _refreshPreviewDisplay() {
    const names = this.previewTrackNames || []

    const display = names.map((name) =>
      this.isPlaying && name === this.currentTrack.label ? `♪ ${name}` : name
    )

    this.preview.list.setItems(display)
  }

  _resize(width, height) {
    this.width = width
    this.height = height

    const panelHeight = this._contentHeight()

    this.fp.width = width / 6
    this.fp.height = panelHeight - 1

    this.preview.list.width = (width / 6) * 2 - 8
    this.preview.list.height = panelHeight

    this.playlist.list.width = (width / 6) * 2
    this.playlist.list.height = panelHeight
  }

  _contentHeight() {
    return this.height - BOTTOM_PADDING - 1
  }

  _renderBody() {
    const menu = this.textInput.input.menuView()
    let menuLines = 0
    if (menu) {
      menuLines = menu.split('\n').length
    }
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

  // ---- view ----

  view() {
    return style.joinVertical(
      style.position.left,
      this._renderHeader(),
      this._renderBody(),
      this._renderTextInput(),
      this._renderFooter()
    )
  }

  _panelBorderColor(panel) {
    return this._activePanel() === panel ? COLORS.accent : COLORS.border
  }

  _sectionLabel(text, panel) {
    const color = this._panelBorderColor(panel)
    return style()
      .foreground(color)
      .bold(true)
      .render(' ' + text)
  }

  _renderFilepicker() {
    const box = style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.FILEPICKER))
      .padding(0, 1)
      .width(this.width / 6)
      .height(this.height - BOTTOM_PADDING - 1)
      .render(this.fp.view())

    return style.joinVertical(
      style.position.left,
      this._sectionLabel('Library', PANEL.FILEPICKER),
      box
    )
  }

  _renderPreview() {
    const width = (this.width / 6) * 2 - 8
    const height = this.height - BOTTOM_PADDING - 1

    const content = this.preview.list.items.length
      ? this.preview.view(this.width / 2, height)
      : style().foreground(COLORS.muted).italic(true).render('No mp3 files here')

    const box = style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.PREVIEW))
      .padding(0, 1)
      .width(width)
      .height(height)
      .render(content)

    const label = `Track${this.previewTrackNames.length ? ` (${this.previewTrackNames.length})` : ''}`

    return style.joinVertical(style.position.left, this._sectionLabel(label, PANEL.PREVIEW), box)
  }

  _renderPlaylist() {
    const width = (this.width / 6) * 3 - 5
    const height = this.height - BOTTOM_PADDING - 1

    const box = style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.PLAYLIST))
      .padding(0, 1)
      .width(width)
      .height(height)
      .render(this.playlist.view((this.width / 6) * 3 - 6, height))

    const label = `Queue${this.playlist.items.length ? ` (${this.playlist.items.length})` : ''}`

    return style.joinVertical(style.position.left, this._sectionLabel(label, PANEL.PLAYLIST), box)
  }

  _renderTextInput() {
    return style()
      .border(style.borders.rounded)
      .borderForeground(this._panelBorderColor(PANEL.TEXT_INPUT))
      .width(this.width - 2)
      .render(this.textInput.view())
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
    if (this.isPlaying && this.currentTrack.label) {
      return (
        style().foreground(COLORS.muted).render('playing: ') +
        style().foreground(COLORS.accent).render(this.currentTrack.label)
      )
    }

    return style()
      .foreground(COLORS.border)
      .render('─'.repeat(Math.max(0, this.width - 24)))
  }

  _renderFooter() {
    const keys = style()
      .foreground(COLORS.muted)
      .render('  ' + this._footerHint())

    const nowPlaying =
      this.isPlaying && this.currentTrack.label
        ? style()
            .foreground(COLORS.pink)
            .bold(true)
            .render('♪ ' + this.currentTrack.label)
        : style().foreground(COLORS.border).render('nothing playing')

    return style.joinHorizontal(style.position.top, keys, '   ', nowPlaying)
  }

  _footerHint() {
    switch (this._activePanel()) {
      case PANEL.FILEPICKER:
        return '↑/↓ move · ↵/→ open · ⌫/← up · tab switch'
      case PANEL.PREVIEW:
        return '↑/↓ move · a add to playlist · tab switch'
      case PANEL.PLAYLIST:
        return '↑/↓ move · ↵ play · q remove · n next · tab switch · ctrl+c quit'
      default:
        return 'tab switch'
    }
  }
}

new Program(new App()).run()
