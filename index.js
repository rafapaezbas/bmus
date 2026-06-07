const { join } = require('bare-path')
const { spawn } = require('bare-subprocess')
const {
  Program,
  // sequence,
  quit,
  key,
  filepicker,
  style,
  // viewport,
  spinner,
  list
} = require('@holepunchto/bare-tui')
const { filterMp3Files } = require('./lib/utils.js')

const constants = {
  FP_PANEL: 0,
  PREVIEW_PANEL: 1
}

class Player {
  constructor() {
    this.process = null
  }

  play(path) {
    this.process = spawn('afplay', [path])
  }

  stop() {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}

class Preview {
  constructor() {
    this.items = []
    this.list = list.create({
      items: this.items,
      title: ''
    })
  }

  view(width, height) {
    return style().width(width).height(height).render(this.list.view())
  }

  update(msg) {
    const [l, cmd] = this.list.update(msg)
    this.list = l
    return cmd
  }
}

class App {
  constructor() {
    this.player = new Player()
    this.width = 80
    this.height = 24
    this.bottomPadding = 4
    this.fp = filepicker.create()
    this.preview = new Preview()
    this.picked = null
    this.selectedPanel = 0
    this.debugMessage = 0
    this.pannels = 2
    this.spinner = spinner.create({ fps: 12 })
    this.currentDir = null
    this.isPlaying = false
    this.currentTrack = null
  }

  init() {
    return this.fp.init()
  }

  update(msg) {
    this.debugMessage = JSON.stringify(msg)
    if (msg.type === 'filepicker.select') {
      this.picked = msg.path
      return [this, null]
    }
    if (msg.type === 'filepicker.entries') {
      this.currentDir = msg.dir
      this._setPreviewItems(msg.dir)
    }
    if (msg.type === 'key' && key.matches(msg, 'q', 'ctrl+c')) {
      return [this, quit]
    }

    if (msg.type === 'resize') {
      this.width = msg.width
      this.height = msg.height
      return [this, null]
    }

    if (msg.type === 'key' && key.matches(msg, 'tab')) {
      this.selectedPanel++
      return [this, null]
    }

    if (msg.type === 'spinner.tick') {
      return this._updateSpinner(msg)
    }

    if (this.selectedPanel % this.pannels === constants.FP_PANEL) {
      return this._updateFp(msg)
    }

    if (this.selectedPanel % this.pannels === constants.PREVIEW_PANEL) {
      if (key.matches(msg, 'enter')) {
        const path = join(this.currentDir, this.preview.list.selectedItem())
        this.isPlaying = true
        this.currentTrack = this.preview.list.selectedItem()
        this.debugMessage = '♪ ' + this.currentTrack
        this.player.stop()
        this.player.play(path)
        return [this, null]
      }
      return this.preview.update(msg)
    }

    return [this, null]
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

  view() {
    const isFilepanel = this.selectedPanel % this.pannels === constants.FP_PANEL
    const isPreviewPanel = this.selectedPanel % this.pannels === constants.PREVIEW_PANEL

    const fp = style()
      .border(style.borders.rounded)
      .borderForeground(isFilepanel ? '#00D7FF' : '#44475A')
      .padding(0, 1)
      .width(this.width / 6)
      .height(this.height - this.bottomPadding)
      .render(this.fp.view())

    const preview = style()
      .border(style.borders.rounded)
      .borderForeground(isPreviewPanel ? '#00D7FF' : '#44475A')
      .padding(0, 1)
      .width(this.width / 2)
      .height(this.height - this.bottomPadding)
      .render(
        this.preview.list.items.length
          ? this.preview.view(this.width / 2, this.height - this.bottomPadding)
          : style().foreground('#6272A4').italic(true).render('No mp3 files here')
      )

    const body = style.joinHorizontal(style.position.top, fp, ' ', preview)

    // Footer: keybinds on left, now-playing on right
    const keys = style()
      .foreground('#6272A4')
      .render('  ↑/↓ move · ↵/→ open · ⌫/← up · tab switch · q quit')

    const nowPlaying =
      this.isPlaying && this.currentTrack
        ? style()
            .foreground('#FF79C6')
            .bold(true)
            .render('♪ ' + this.currentTrack)
        : style().foreground('#44475A').render('nothing playing')

    const footer = style.joinHorizontal(style.position.top, keys, '   ', nowPlaying)

    return style.joinVertical(style.position.left, body, ' ', footer)
  }
}

new Program(new App()).run()
