const fs = require('bare-fs')
const { extname } = require('bare-path')

function filterMp3Files(path) {
  const files = fs.readdirSync(path)
  return files.filter(file => extname(file).toLowerCase() === '.mp3')
}

module.exports = { filterMp3Files }
