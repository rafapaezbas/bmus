# bmus

A lightweight terminal music player for audio files, built on the [`bare`](https://github.com/holepunch/bare) runtime and [`bare-tui`](https://github.com/holepunchto/bare-tui). Inspired by [`cmus`](https://github.com/cmus/cmus).

<img width="2560" height="1600" alt="image" src="https://github.com/user-attachments/assets/81bf3e1a-9318-46ee-9785-0545b6462794" />

## Updates

bmus updates itself peer-to-peer. Using [`pear-runtime-updater`](https://github.com/holepunchto/pear-runtime-updater), new versions are pulled straight from other peers over the network instead of a central server — no registry or app store in the path.

## Installation

```bash
npm install
```

## Usage

```bash
bare index.js
```

## Keybindings

| Key         | Action                            |
| ----------- | --------------------------------- |
| `tab`       | Next panel                        |
| `shift+tab` | Previous panel                    |
| `↑` / `↓`   | Move selection                    |
| `↵` / `→`   | Open folder                       |
| `⌫` / `←`   | Go up a folder                    |
| `a`         | Add selected track to queue       |
| `↵`         | Play selected track (Queue panel) |
| `n`         | Play next track                   |
| `q`         | Remove selected track from queue  |
| `ctrl+c`    | Quit                              |

## Commands

Type a command in the input bar at the bottom:

| Command   | Description                                       |
| --------- | ------------------------------------------------- |
| `add-all` | Add all tracks in the current folder to the queue |
| `clear`   | Clear the queue                                   |

## License

MIT
