const path = require('bare-path')
const os = require('bare-os')
const { isWindows, isLinux } = require('which-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const PearRuntimeUpdater = require('pear-runtime-updater')
const pkg = require('./package.json')
const run = require('./app.js')

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

  updater.on('updated', async () => {
    await updater.applyUpdate()
  })

  swarm.join(updater.drive.core.discoveryKey)
  run()
}

function storage() {
  if (isWindows) return path.join(os.homedir(), 'AppData', 'Roaming', 'bmus')
  if (isLinux) return path.join(os.homedir(), '.config', 'bmus')
  return path.join(os.homedir(), 'Library', 'Application Support', 'bmus')
}
