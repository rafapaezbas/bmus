const fs = require('bare-fs')
const { extname, join } = require('bare-path')
const { spawn } = require('bare-subprocess')
const EventEmitter = require('bare-events')
const { list, style, autocomplete } = require('bare-tui')

// TODO return full path

function filterMp3Files(path) {
  const files = fs.readdirSync(path)
  return files
    .filter((file) => extname(file).toLowerCase() === '.mp3')
    .map((file) => ({ path: path, name: file }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) // natural order
}

function searchMp3Files(path) {
  const entries = fs.readdirSync(path, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => join(path, e.name))
  return [...filterMp3Files(path), ...dirs.flatMap((dir) => searchMp3Files(dir))]
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
  constructor(app) {
    this.items = []
    this.list = list.create({
      items: this.items,
      title: ''
    })
    this.app = app
  }
  view(width, height) {
    return style().width(width).height(height).render(this.list.view())
  }
  update(msg) {
    const [l, cmd] = this.list.update(msg)
    this.list = l
    return cmd
  }
  refresh() {
    const display = this.items.map((item) =>
      this.app.isPlaying && item.name === this.app.currentTrack.label ? `♪ ${item.name}` : item.name
    )
    this.list.setItems(display)
  }
}

class Playlist {
  constructor(app) {
    this.items = []
    this.list = list.create({ items: this.items })
    this.app = app
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
  refresh() {
    const selected = this.list.selected // remember position to reset after setItems
    const display = this.items.map((path) =>
      this.app.isPlaying && path === this.app.currentTrack.path ? `♪ ${path}` : path
    )
    this.list.setItems(display)
    this.list.selected = selected
  }
  clear() {
    this.items.length = 0
    this.list.setItems(this.items)
  }
}

class TextInput {
  constructor(app) {
    this.input = autocomplete
      .create({
        prompt: '> ',
        placeholder: '/ for commands',
        suggestions: [
          { name: 'clear', desc: 'clear the queue' },
          { name: 'add-all', desc: 'add all tracks fin the preview' },
          { name: 'search', desc: 'search all mp3 files in folder' }
        ]
      })
      .focus()
    this.commands = new Map()
    this.app = app
  }

  submit(msg) {
    if (this.input.open) {
      this.input.accept()
    } else {
      const command = this.input.value.split(' ')[0]?.substring(1) // crop '/'
      this.commands.get(command)()
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

module.exports = {
  filterMp3Files,
  searchMp3Files,
  Player,
  Preview,
  Playlist,
  createFoldersOnlyFs,
  TextInput
}
