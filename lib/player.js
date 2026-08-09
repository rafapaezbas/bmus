const { join } = require('bare-path')
const MiniAudio = require('bare-miniaudio')
const ReadyResource = require('ready-resource')

class Player extends ReadyResource {
  constructor(onTrackEnd) {
    super()
    this.playlist = []
    this.currentIndex = -1
    this.random = false
    this._onTrackEnd = onTrackEnd
    this._audio = new MiniAudio()
  }

  _open() {
    return this._audio.ready()
  }

  get current() {
    return this.playlist[this.currentIndex] ?? null
  }

  add(track) {
    this.playlist.push(track)
  }

  remove(index) {
    if (index < 0 || index >= this.playlist.length) return
    this.playlist.splice(index, 1)
    if (index === this.currentIndex) {
      this.currentIndex = -1
      this.stop()
    } else if (index < this.currentIndex) {
      this.currentIndex-- // keep pointing at the same track
    }
  }

  clear() {
    this.playlist.length = 0
    this.currentIndex = -1
    this.stop()
  }

  play(index) {
    const track = this.playlist[index]
    if (!track) return
    this.currentIndex = index
    this.stop()
    this._audio.play(join(track.path, track.name)).then((ended) => {
      if (ended) this._onTrackEnd() // stopping resolves with false, so only natural ends advance
    })
  }

  next() {
    if (this.playlist.length === 0) return
    this.play(this._nextIndex())
  }

  stop() {
    return this._audio.stop()
  }

  toggleRandom() {
    this.random = !this.random
    return this.random
  }

  _nextIndex() {
    if (!this.random || this.playlist.length === 1) {
      return (this.currentIndex + 1) % this.playlist.length
    }
    let index = this.currentIndex
    while (index === this.currentIndex) {
      index = Math.floor(Math.random() * this.playlist.length)
    }
    return index
  }
}

module.exports = Player
