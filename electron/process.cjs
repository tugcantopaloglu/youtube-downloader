const { spawn } = require('node:child_process')
const readline = require('node:readline')

function runProcess(executable, args, options = {}) {
  const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  options.onSpawn?.(child)
  let stdout = ''
  let stderr = ''
  let failure
  const abort = () => {
    failure = new Error('İşlem iptal edildi.')
    failure.name = 'AbortError'
    void stopProcess(child)
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const stdoutReader = readline.createInterface({ input: child.stdout })
  const stderrReader = readline.createInterface({ input: child.stderr })
  stdoutReader.on('line', line => {
    if (options.onLine) options.onLine(line)
    else {
      stdout += `${line}\n`
      if (stdout.length > (options.maxOutput || 32 * 1024 * 1024)) {
        failure = new Error('Liste çok büyük. Daha küçük bir playlist ile deneyin.')
        stopProcess(child)
      }
    }
  })
  stderrReader.on('line', line => {
    stderr = `${stderr}${line}\n`.slice(-12000)
    options.onErrorLine?.(line)
    options.onLine?.(line)
  })
  const timer = options.timeout ? setTimeout(() => {
    failure = new Error('İşlem zaman aşımına uğradı. Bağlantınızı kontrol edip yeniden deneyin.')
    failure.code = 'ETIMEDOUT'
    stopProcess(child)
  }, options.timeout) : null
  return new Promise((resolve, reject) => {
    child.once('error', error => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      stdoutReader.close()
      stderrReader.close()
      if (failure) reject(failure)
      else if (code !== 0) reject(new Error(stderr.trim() || `İndirme işlemi kapandı (${code}).`))
      else resolve({ stdout, stderr })
    })
  })
}

function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  if (process.platform !== 'win32') {
    child.kill('SIGTERM')
    return Promise.resolve()
  }
  return new Promise(resolve => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false, stdio: 'ignore' })
    killer.once('error', () => { child.kill(); resolve() })
    killer.once('close', resolve)
  })
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const error = new Error('İşlem iptal edildi.')
      error.name = 'AbortError'
      reject(error)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

module.exports = { runProcess, stopProcess, abortable }
