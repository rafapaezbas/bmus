const path = require('bare-path')
const os = require('bare-os')
const { isWindows, isLinux } = require('which-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const PearRuntimeUpdater = require('pear-runtime-updater')
const pkg = require('./package.json')
const runGUI = require('./app.js')
const runHeadless = require('./mcp.js')

const store = new Corestore(path.join(storage(), 'pear-runtime/corestore'))
const swarm = new Hyperswarm()

swarm.on('connection', (c) => {
  store.replicate(c)
})

const updater = new PearRuntimeUpdater({
  dir: storage(),
  store,
  version: pkg.version,
  app: os.execPath(),
  name: pkg.name,
  upgrade: pkg.upgrade
})

main()

async function main() {
  await store.ready()
  await updater.ready()
  swarm.join(updater.drive.core.discoveryKey)
  if (Bare.argv.includes('--headless')) {
    runHeadless(teardown)
  } else {
    runGUI(teardown, updater)
  }
}

function storage() {
  if (isWindows) return path.join(os.homedir(), 'AppData', 'Roaming', 'bmus')
  if (isLinux) return path.join(os.homedir(), '.config', 'bmus')
  return path.join(os.homedir(), 'Library', 'Application Support', 'bmus')
}

function teardown() {
  updater.close()
  swarm.destroy() // TODO report segmentation fault
}
