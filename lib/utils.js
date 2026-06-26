const fs = require('bare-fs')
const { extname } = require('bare-path')
const { spawn } = require('bare-subprocess')
const EventEmitter = require('bare-events')
const { list, style, autocomplete } = require('@holepunchto/bare-tui')
function filterMp3Files(path) {
  const files = fs.readdirSync(path)
  return files
    .filter((file) => extname(file).toLowerCase() === '.mp3')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) // natural order
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
class Player extends EventEmitter {
  constructor() {
    super()
    this.process = null
  }
  play(path) {
    this.stop()
    this.process = spawn('afplay', [path])
    this.process.on('close', (code, signal) => this.emit('stop', { code, signal }))
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
class Playlist {
  constructor(width, height) {
    this.items = []
    this.list = list.create({ items: this.items })
  }
  addTrack(track) {
    this.items.push(track)
    const selected = this.list.selected // remember position to reset after setting items
    this.list.setItems(this.items)
    this.list.selected = selected
  }
  removeSelected() {
    const selected = this.list.selectedItem()
    const index = this.items.indexOf(selected)
    if (index === -1) return
    this.items.splice(index, 1)
    this.list.setItems(this.items)
    this.list.selected = index - 1 // same as above, keep the position in the list
  }
  view(width, height) {
    const playlist = style()
      .width(width - 1)
      .height(height)
      .render(this.list.view())
    return this.items.length
      ? playlist
      : style().foreground('#6272A4').italic(true).render('Playlist is empty')
  }
  update(msg) {
    const [l, cmd] = this.list.update(msg)
    this.list = l
    return cmd
  }
}

class TextInput {
  constructor() {
    this.input = autocomplete
      .create({
        prompt: '> ',
        placeholder: ': for commands',
        suggestions: [
          { name: 'help', desc: 'show help' },
          { name: 'clear', desc: 'clear the screen' },
          { name: 'quit', desc: 'exit' }
        ]
      })
      .focus()
  }

  submit() {
    this.input.reset()
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
module.exports = { filterMp3Files, Player, Preview, Playlist, createFoldersOnlyFs, TextInput }
