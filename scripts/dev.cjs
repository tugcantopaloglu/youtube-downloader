const { spawn } = require('node:child_process')
const path = require('node:path')

async function main() {
  const { createServer } = await import('vite')
  const server = await createServer({ configFile: path.resolve('vite.config.mjs') })
  await server.listen()
  const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, AKIS_DEV_URL: 'http://127.0.0.1:5173' } })
  child.on('close', async code => { await server.close(); process.exit(code || 0) })
  process.on('SIGINT', () => child.kill())
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exit(1) })
