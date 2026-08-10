# bmus

A terminal music player for audio files, built on the [`bare`](https://github.com/holepunch/bare) runtime and [`bare-tui`](https://github.com/holepunchto/bare-tui). Inspired by [`cmus`](https://github.com/cmus/cmus).

<img width="2560" height="1600" alt="image" src="https://github.com/user-attachments/assets/81bf3e1a-9318-46ee-9785-0545b6462794" />

## Updates

bmus updates itself peer-to-peer. Using [`pear-runtime-updater`](https://github.com/holepunchto/pear-runtime-updater), new versions are pulled straight from other peers over the network instead of a central server — no registry or app store in the path.

## Installation

```bash
npm install
```

## Usage

```bash
bmus
```

## Headless mode

Passing `--headless` starts bmus with no interface, as an [MCP](https://modelcontextprotocol.io) server speaking JSON-RPC over stdin/stdout. An AI assistant can then browse your library, build a queue, and control playback — the audio still comes out of your speakers, since it is the same player underneath.

```bash
bmus --headless
```

The process is not meant to be run by hand: it reads a protocol on stdin and writes one to stdout. Normally an MCP client launches it for you.

### Using it with Claude Code

```bash
claude mcp add bmus -- bmus --headless
```

Then run `/mcp` inside Claude Code to check that it connected and to see the tools.

### Using it with Claude Desktop

Add an entry to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bmus": {
      "command": "bmus",
      "args": ["--headless"]
    }
  }
}
```

### Notes

- **Only one bmus can run at a time.** The instance holds a lock on its storage, so a headless server will fail to start while the TUI is open, and vice versa. Quit one before starting the other.
- **The queue lives in the process.** It is not persisted, and playback stops when the client disconnects and the server exits.
- **stdout is the protocol channel.** Diagnostics go to stderr, so check stderr when a client reports the server as failing.

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
| `search`  | List every audio file under the current folder    |

## License

MIT
