const fsp = require('fs/promises')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

const { env, platform, arch } = process
const isWindows = platform === 'win32'

const exists = (filepath) =>
  fsp
    .access(filepath)
    .then(() => true)
    .catch(() => false)

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on('exit', (code, signal) => {
      resolve(signal ? 128 + signal : code)
    })
    child.on('error', reject)
  })
}

const gc = []
async function make() {
  const host = `${platform}-${arch}`
  const bin = isWindows ? 'bmus.exe' : 'bmus'
  const out = path.join('.', 'out', 'make')

  const signFlags = []
  const extraEnv = {}
  const sign = !!(env.MAC_CODESIGN_IDENTITY || env.KEYCHAIN_PROFILE)
  if (sign) {
    signFlags.push('--sign')
    if (env.MAC_CODESIGN_IDENTITY) {
      signFlags.push('--hardened-runtime')
      signFlags.push('--entitlements', path.resolve(__dirname, '..', 'entitlements.plist'))
      signFlags.push('--identity', env.MAC_CODESIGN_IDENTITY)
    }
    if (env.KEYCHAIN_PROFILE) signFlags.push('--keychain', env.KEYCHAIN_PROFILE)
  }

  console.log('Running bare-build for channel', sign ? 'with signing' : 'without signing')
  const build = spawn(
    'bare-build',
    [
      '--standalone',
      '--base',
      '.',
      '--name',
      'bmus',
      '--description',
      '"Minimal CLI mp3 player"',
      ...signFlags,
      '--host',
      host,
      '--out',
      out,
      `index.js`
    ],
    { stdio: 'inherit', shell: isWindows, env: { ...env, ...extraEnv } }
  )

  const buildExitCode = await waitForExit(build)
  if (buildExitCode === 0) console.log('bare-build successful')
  else throw new Error(`bare-build failed with exit code ${buildExitCode}`)

  if (sign && env.KEYCHAIN_PROFILE) {
    console.log('Compressing binary into a zip file for notarization...')
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bmus-notarize-'))
    gc.push(tmpDir)
    const zipPath = path.join(tmpDir, 'bmus.zip')
    const compress = spawn('ditto', ['-c', '-k', '--sequesterRsrc', path.join(out, bin), zipPath], {
      stdio: 'inherit'
    })

    const compressExitCode = await waitForExit(compress)
    if (compressExitCode === 0) console.log('Compression successful')
    else throw new Error(`Compression failed with exit code ${compressExitCode}`)

    console.log('Notarizing binary...')
    const notarize = spawn(
      'xcrun',
      ['notarytool', 'submit', zipPath, '--keychain-profile', env.KEYCHAIN_PROFILE, '--wait'],
      { stdio: 'inherit' }
    )

    const notarizeExitCode = await waitForExit(notarize)
    if (notarizeExitCode === 0) console.log('Notarization successful')
    else throw new Error(`Notarization failed with exit code ${notarizeExitCode}`)
  }
}

make()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    for (const dir of gc) {
      try {
        await fsp.rm(dir, { recursive: true, force: true })
      } catch (err) {
        console.error(`Failed to cleanup ${dir}:`, err)
      }
    }
  })
