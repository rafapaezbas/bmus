const { list, style, autocomplete } = require('bare-tui')

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
  refresh(current) {
    const display = this.items.map((item) =>
      current && item.path === current.path && item.name === current.name
        ? `♪ ${item.name}`
        : item.name
    )
    this.list.setItems(display)
  }
}

class Playlist {
  constructor() {
    this.list = list.create({ items: [] })
  }
  view(width, height) {
    const playlist = style()
      .width(width - 1)
      .height(height)
      .render(this.list.view())
    return this.list.items.length
      ? playlist
      : style().foreground('#6272A4').italic(true).render('Playlist is empty')
  }
  update(msg) {
    const [l, cmd] = this.list.update(msg)
    this.list = l
    return cmd
  }
  refresh(items, currentIndex) {
    const selected = this.list.selected // remember position to reset after setItems
    const display = items.map((item, i) =>
      i === currentIndex ? `♪ ${this._formatItem(item)}` : this._formatItem(item)
    )
    this.list.setItems(display)
    // clamp, the list may have shrunk since the position was taken
    this.list.selected = Math.max(0, Math.min(selected, display.length - 1))
  }

  _formatItem(item) {
    const common = item.metadata?.common || {}
    const format = item.metadata?.format || {}
    const title = common.title || item.name
    const label = common.artist ? `${common.artist} - ${title}` : title
    const duration = Number.isFinite(format.duration)
      ? ` ${this._formatDuration(format.duration)}`
      : ''
    return `${label}${duration}`
  }

  _formatDuration(seconds) {
    const totalSeconds = Math.round(parseFloat(seconds))
    const minutes = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${minutes}:${String(secs).padStart(2, '0')}`
  }
}

class TextInput {
  constructor() {
    this.input = autocomplete
      .create({
        prompt: '> ',
        placeholder: '/ for commands',
        suggestions: [
          { name: 'clear', desc: 'clear the queue' },
          { name: 'add-all', desc: 'add all tracks fin the preview' },
          { name: 'search', desc: 'search all audio files in folder' }
        ]
      })
      .focus()
    this.commands = new Map()
  }

  submit(msg) {
    if (this.input.open) {
      this.input.accept()
    } else {
      const command = this.input.value.split(' ')[0]?.substring(1) // crop '/'
      const fn = this.commands.get(command)
      if (fn) fn()
      this.input.reset()
    }
    return this.update(msg)
  }

  registerCommand(name, fn) {
    this.commands.set(name, fn)
  }

  update(msg) {
    const [input, cmd] = this.input.update(msg)
    this.input = input
    return cmd
  }

  view() {
    return [this.input.menuView(), this.input.view()].filter(Boolean).join('\n')
  }
}

module.exports = { TextInput, Preview, Playlist }
