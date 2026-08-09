// Minimal MCP server over stdio: JSON-RPC 2.0 framed as newline-delimited JSON.
// Protocol only — it knows nothing about audio. Register tools with tool().

const PROTOCOL_VERSION = '2025-06-18'

const ERROR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603
}

class McpServer {
  constructor(opts = {}) {
    this.name = opts.name
    this.version = opts.version
    this.instructions = opts.instructions
    this.tools = new Map()

    this._stdin = opts.stdin
    this._stdout = opts.stdout
    this._buffer = ''
    this._initialized = false
    this._pending = 0
    this._onIdle = null
  }

  // Resolves once no request is still being handled, so a shutdown triggered by
  // stdin closing doesn't drop responses that are already in flight.
  drain() {
    if (this._pending === 0) return Promise.resolve()
    return new Promise((resolve) => {
      this._onIdle = resolve
    })
  }

  tool(name, { description, inputSchema, handler }) {
    this.tools.set(name, { description, inputSchema, handler })
  }

  listen() {
    this._stdin.on('data', (chunk) => this._onData(chunk))
  }

  _onData(chunk) {
    this._buffer += chunk
    // Messages are newline-delimited; the last element is a partial line
    const lines = this._buffer.split('\n')
    this._buffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) this._onLine(trimmed)
    }
  }

  _onLine(line) {
    let message = null
    try {
      message = JSON.parse(line)
    } catch {
      return this._send({ jsonrpc: '2.0', id: null, error: err(ERROR.PARSE, 'Parse error') })
    }

    if (Array.isArray(message)) {
      const id = null
      return this._send({
        jsonrpc: '2.0',
        id,
        error: err(ERROR.INVALID_REQUEST, 'Batch requests are not supported')
      })
    }

    if (message === null || typeof message !== 'object' || typeof message.method !== 'string') {
      return this._send({
        jsonrpc: '2.0',
        id: message?.id ?? null,
        error: err(ERROR.INVALID_REQUEST, 'Invalid request')
      })
    }

    this._dispatch(message)
  }

  async _dispatch(message) {
    const { id, method, params } = message
    const isNotification = id === undefined || id === null

    this._pending++
    try {
      const result = await this._handle(method, params ?? {})
      if (!isNotification) this._send({ jsonrpc: '2.0', id, result }) // notifications get no response
    } catch (e) {
      if (!isNotification) {
        const code = typeof e.code === 'number' ? e.code : ERROR.INTERNAL
        this._send({ jsonrpc: '2.0', id, error: err(code, e.message) })
      }
    } finally {
      this._pending--
      if (this._pending === 0 && this._onIdle) {
        const resolve = this._onIdle
        this._onIdle = null
        resolve()
      }
    }
  }

  _handle(method, params) {
    switch (method) {
      case 'initialize':
        return this._initialize(params)

      case 'notifications/initialized':
        this._initialized = true
        return null

      case 'ping':
        return {}

      case 'tools/list':
        return {
          tools: [...this.tools].map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        }

      case 'tools/call':
        return this._callTool(params)

      default:
        throw rpcError(ERROR.METHOD_NOT_FOUND, `Unknown method: ${method}`)
    }
  }

  _initialize(params) {
    // Echo the client's version when it sends one, so the handshake doesn't
    // depend on this file knowing the newest spec date.
    const version =
      typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION

    return {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: this.name, version: this.version },
      instructions: this.instructions
    }
  }

  async _callTool(params) {
    const tool = this.tools.get(params.name)
    if (!tool) throw rpcError(ERROR.INVALID_PARAMS, `Unknown tool: ${params.name}`)

    try {
      const text = await tool.handler(params.arguments ?? {})
      return { content: [{ type: 'text', text }] }
    } catch (e) {
      // Tool failures are results, not protocol errors, so the model can react
      return { content: [{ type: 'text', text: e.message }], isError: true }
    }
  }

  _send(message) {
    this._stdout.write(JSON.stringify(message) + '\n')
  }
}

function err(code, message) {
  return { code, message }
}

function rpcError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

module.exports = { McpServer, ERROR }
