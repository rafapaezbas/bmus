const { Program, sequence, quit, key, filepicker, style, viewport, spinner, list } = require('@holepunchto/bare-tui')
const { filterMp3Files } = require('./lib/utils.js')

const constants = {
  FP_PANEL : 0,
  PREVIEW_PANEL: 1
}

class Preview {
  constructor() {
    this.items = []
    this.list = list.create({
      items: this.items,
      title: ''
    })
  }

  view () {
    return this.list.view()
  }
}

class App {
  constructor() {
    this.width = 80
    this.height = 24
    this.bottomPadding = 4
    this.fp = filepicker.create()
    this.preview = new Preview()
    this.picked = null
    this.selectedPanel = 0
    this.debugMessage = 0
    this.pannels = 2 // how many pannels the app has
    this.spinner = spinner.create({ fps: 12 })
  }

  init() {
    // return sequence(this.fp.init(), this.spinner.init())
    return this.fp.init()
  }

  update(msg) {
    this.debugMessage = JSON.stringify(msg)
    if (msg.type === 'filepicker.select') {
      this.picked = msg.path
      return [this, null]
    }
    if (msg.type === 'filepicker.entries') {
      this._updatePreview(msg.dir)
      // return [this, null]
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

    if (this.selectedPanel % this.pannels === constants.FP_PANEL) { // fp active
      return this._updateFp(msg)
    }

    return [this, null]
  }

  _updateFp (msg) {
    const [fp, cmd] = this.fp.update(msg)
    this.fp = fp
    return [this, cmd]
  }

  _updateSpinner(msg) {
    const [s, cmd] = this.spinner.update(msg)
    this.spinner = s
    return [this, cmd]
  }

  _updatePreview(path) {
    this.preview.list.setItems(filterMp3Files(path))
  }

  view() {
    const fp = style()
      .border(style.borders.rounded)
      .borderForeground(this.selectedPanel % this.pannels === constants.FP_PANEL ? 'red' : 'blue')
      .padding(0, 1)
      .width(this.width / 6)
      .height(this.height - this.bottomPadding)
      .render(this.fp.view())

    const spinner = style()
      .bold(true)
      .foreground('green')
      .render(this.spinner.view())

    const preview = style()
      .border(style.borders.rounded)
      .borderForeground(this.selectedPanel % this.pannels === constants.PREVIEW_PANEL ? 'red' : 'blue')
      .padding(0, 1)
      .width(this.width / 2)
      .height(this.height - this.bottomPadding)
    // .render(spinner + ' hello tui!')
      .render(this.preview.view())

    const body = style.joinHorizontal(style.position.top, fp, ' ', preview)

    const footer = this.picked
      ? `  ✓ picked: ${this.picked}`
      : '  ↑/↓ move · ↵/→ open · ⌫/← up · q quit '

    return style.joinVertical(
      style.position.left,
      body,
      footer
    )
  }
}

new Program(new App()).run()

