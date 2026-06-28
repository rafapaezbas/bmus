# bmus

A lightweight terminal music player for mp3 files, built on the [`bare`](https://github.com/holepunch/bare) runtime and [`bare-tui`](https://github.com/holepunchto/bare-tui).

## Features

- Browse your filesystem and preview mp3 files in any folder
- Queue tracks into a playlist and play them in order
- Natural sort order for tracks (e.g. `track2` before `track10`)
- Keyboard-driven interface with panel navigation
- Now playing indicator in the header and footer

## Installation

```bash
npm install
```

## Usage

```bash
bare index.js
```

## Keybindings

| Key | Action |
|---|---|
| `tab` | Next panel |
| `shift+tab` | Previous panel |
| `↑` / `↓` | Move selection |
| `↵` / `→` | Open folder |
| `⌫` / `←` | Go up a folder |
| `a` | Add selected track to queue |
| `↵` | Play selected track (Queue panel) |
| `n` | Play next track |
| `q` | Remove selected track from queue |
| `ctrl+c` | Quit |

## Commands

Type a command in the input bar at the bottom:

| Command | Description |
|---|---|
| `add-all` | Add all tracks in the current folder to the queue |
| `clear` | Clear the queue |

## License

MIT
