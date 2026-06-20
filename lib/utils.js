const fs = require('bare-fs')
const { extname } = require('bare-path')
const { spawn } = require('bare-subprocess')
const { list, style } = require('@holepunchto/bare-tui')
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
class Playlist {
  constructor(width, height) {
    this.items = []
    this.list = list.create({ items: this.items })
  }
  addTrack(track) {
    this.items.push(track)
    this.list.setItems(this.items)
  }
  removeSelected() {
    const selected = this.list.selectedItem()
    const index = this.items.indexOf(selected)
    if (index === -1) return

    this.items.splice(index, 1)
    this.list.setItems(this.items)
  }
  view(width, height) {
    const centered = 'Playlist'.padStart((width + 'Playlist'.length) / 2).padEnd(width + 2)
    const header = style().foreground('black').background('white').bold(true).render(centered)
    const playlist = style()
      .width(width - 1)
      .height(height)
      .render(this.list.view())
    return style.joinVertical(
      style.position.left,
      header,
      ' ',
      this.items.length ? playlist : ''
    )
  }
  update(msg) {
    const [l, cmd] = this.list.update(msg)
    this.list = l
    return cmd
  }
}
module.exports = { filterMp3Files, Player, Preview, Playlist, createFoldersOnlyFs }
