const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? files(file) : /\.(cjs|mjs|js)$/.test(file) ? [file] : []
  })
}

for (const file of [...files('electron'), ...files('scripts'), ...files('ui'), 'vite.config.mjs']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1) }
}
process.stdout.write('JavaScript syntax validation completed.\n')
