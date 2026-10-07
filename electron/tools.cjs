const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { extractArchive } = require('./archive.cjs')
const { latestRelease, expectedDigest, downloadVerified } = require('./network.cjs')
const { runProcess } = require('./process.cjs')
const { validateExecutable } = require('./executable.cjs')

const definitions = [
  { name: 'ytdlp', label: 'yt-dlp', repo: 'yt-dlp/yt-dlp-nightly-builds', asset: 'yt-dlp.exe', exe: 'yt-dlp.exe', args: ['--version'] },
  { name: 'ffmpeg', label: 'FFmpeg', repo: 'yt-dlp/FFmpeg-Builds', asset: 'ffmpeg-master-latest-win64-gpl-shared.zip', exe: 'ffmpeg.exe', args: ['-version'] },
  { name: 'deno', label: 'Deno', repo: 'denoland/deno', asset: 'deno-x86_64-pc-windows-msvc.zip', exe: 'deno.exe', args: ['--version'] }
]

function findFile(directory, filename) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isFile() && entry.name === filename) return target
    if (entry.isDirectory()) {
      const result = findFile(target, filename)
      if (result) return result
    }
  }
}

class ToolManager {
  constructor(store, directory, notify, isBusy = () => false) {
    this.store = store
    this.directory = directory
    this.notify = notify
    this.isBusy = isBusy
    this.pending = null
    this.status = { busy: false, message: 'İndirme araçları hazırlanıyor', progress: null, error: '' }
    fs.mkdirSync(directory, { recursive: true })
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('.staging-')) {
        try { this.removeDirectory(path.join(directory, entry.name)) } catch {}
      }
    }
  }

  ready() {
    return definitions.every(tool => this.usable(tool, this.store.data.tools[tool.name]))
  }

  usable(tool, current) {
    try {
      if (!current?.path) return false
      validateExecutable(current.path)
      if (tool.name === 'ffmpeg') validateExecutable(path.join(path.dirname(current.path), 'ffprobe.exe'))
      return true
    } catch { return false }
  }

  snapshot() {
    return { ...this.status, ready: this.ready(), versions: Object.fromEntries(definitions.map(tool => [tool.name, this.store.data.tools[tool.name]?.version || 'Kurulmadı'])) }
  }

  setStatus(patch) {
    Object.assign(this.status, patch)
    this.notify()
  }

  removeDirectory(target) {
    const relative = path.relative(path.resolve(this.directory), path.resolve(target))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Geçersiz araç klasörü.')
    fs.rmSync(target, { recursive: true, force: true })
  }

  cleanup() {
    if (this.pending || this.isBusy()) return
    for (const tool of definitions) {
      const current = this.store.data.tools[tool.name]?.path
      const directory = path.join(this.directory, tool.name)
      if (!current || !fs.existsSync(directory)) continue
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name)
        const relative = path.relative(target, current)
        if (entry.isDirectory() && (relative.startsWith('..') || path.isAbsolute(relative))) {
          try { this.removeDirectory(target) } catch {}
        }
      }
    }
  }

  async ensure() {
    if (this.ready()) return
    await this.check(false)
    if (!this.ready()) throw new Error(this.status.error || 'İndirme araçları kurulamadı.')
  }

  check(force = false) {
    if (this.pending) return this.pending
    if (!force && this.ready() && (!this.store.data.settings.autoUpdateTools || Date.now() - this.store.data.toolsCheckedAt < 24 * 60 * 60 * 1000)) {
      this.setStatus({ message: 'İndirme araçları hazır' })
      return Promise.resolve()
    }
    this.pending = this.performCheck(force).finally(() => { this.pending = null; this.cleanup() })
    return this.pending
  }

  async performCheck(force) {
    this.setStatus({ busy: true, error: '', progress: null })
    const errors = []
    for (const tool of definitions) {
      const current = this.store.data.tools[tool.name]
      const exists = this.usable(tool, current)
      if (!force && exists && !this.store.data.settings.autoUpdateTools) continue
      if (!force && exists && tool.name !== 'ytdlp' && Date.now() - (current.checkedAt || 0) < 7 * 24 * 60 * 60 * 1000) continue
      let staging
      try {
        this.setStatus({ message: `${tool.label} güncellemeleri kontrol ediliyor`, progress: null })
        const release = await latestRelease(tool.repo)
        const asset = release.assets.find(item => item.name === tool.asset)
        if (!asset) throw new Error(`${tool.label} indirme dosyası bulunamadı.`)
        const digest = await expectedDigest(release, asset)
        if (exists && current.digest === digest) {
          current.checkedAt = Date.now()
          this.store.save()
          continue
        }
        staging = path.join(this.directory, `.staging-${randomUUID()}`)
        fs.mkdirSync(staging)
        const archive = path.join(staging, tool.asset)
        this.setStatus({ message: `${tool.label} ${exists ? 'güncelleniyor' : 'indiriliyor'}`, progress: 0 })
        await downloadVerified(asset, archive, digest, progress => this.setStatus({ progress }))
        const content = path.join(staging, 'content')
        fs.mkdirSync(content)
        if (tool.asset.endsWith('.zip')) await extractArchive(archive, content)
        else fs.copyFileSync(archive, path.join(content, tool.exe))
        const executable = findFile(content, tool.exe)
        if (!executable) throw new Error(`${tool.label} arşivi eksik.`)
        if (tool.name === 'ffmpeg' && !fs.existsSync(path.join(path.dirname(executable), 'ffprobe.exe'))) throw new Error('FFprobe arşivde bulunamadı.')
        validateExecutable(executable)
        if (tool.name === 'ffmpeg') {
          const ffprobe = path.join(path.dirname(executable), 'ffprobe.exe')
          validateExecutable(ffprobe)
          await runProcess(ffprobe, ['-version'], { timeout: 30000 })
        }
        const { stdout } = await runProcess(executable, tool.args, { timeout: 30000 })
        if (!force && exists && !this.store.data.settings.autoUpdateTools) continue
        const destination = path.join(this.directory, tool.name, `${digest.slice(0, 16)}-${randomUUID().slice(0, 8)}`)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        const relative = path.relative(content, executable)
        fs.renameSync(content, destination)
        this.store.data.tools[tool.name] = { path: path.join(destination, relative), digest, version: stdout.trim().split(/\r?\n/)[0].replace(/^ffmpeg version /, '').replace(/^deno /, '').slice(0, 90), checkedAt: Date.now() }
        this.store.save()
      } catch (error) {
        errors.push(`${tool.label}: ${error.message}`)
      } finally {
        if (staging) {
          try { this.removeDirectory(staging) } catch {}
        }
      }
    }
    if (!errors.length) this.store.data.toolsCheckedAt = Date.now()
    this.store.save()
    this.setStatus({ busy: false, progress: null, message: this.ready() ? 'İndirme araçları hazır' : 'Araçların kurulumu tamamlanamadı', error: errors.join('\n') })
  }

  arguments(settings = this.store.data.settings) {
    const tools = this.store.data.tools
    const args = ['--ignore-config', '--no-plugin-dirs', '--no-colors', '--encoding', 'utf-8', '--socket-timeout', '30', '--retries', '5', '--fragment-retries', '5', '--extractor-retries', '3', '--retry-sleep', 'http:exp=1:30', '--retry-sleep', 'fragment:exp=1:30', '--retry-sleep', 'extractor:exp=2:30', '--sleep-requests', '0.75', '--concurrent-fragments', '1', '--abort-on-unavailable-fragments', '--no-js-runtimes', '--js-runtimes', `deno:${tools.deno.path}`, '--ffmpeg-location', path.dirname(tools.ffmpeg.path)]
    if (settings.cookiesFile) {
      if (!fs.existsSync(settings.cookiesFile)) throw Object.assign(new Error('Seçilen cookies.txt dosyası bulunamadı. Ayarlar ekranından yeniden seçin.'), { code: 'AUTH_REQUIRED' })
      args.push('--cookies', settings.cookiesFile)
    }
    return args
  }
}

module.exports = { ToolManager }
