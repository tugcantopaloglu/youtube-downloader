const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { runProcess, stopProcess, abortable } = require('./process.cjs')
const { validateMedia, publishMedia, fileDigest } = require('./media.cjs')

const activeStatuses = ['preparing', 'downloading', 'processing', 'verifying', 'saving', 'cancelling']
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'])

function youtubeURL(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Geçerli bir YouTube bağlantısı girin.')
  let url
  try { url = new URL(value.trim()) } catch { throw new Error('YouTube bağlantısının tamamını yapıştırın.') }
  if (!['https:', 'http:'].includes(url.protocol) || !youtubeHosts.has(url.hostname) || url.username || url.password || url.port) throw new Error('Yalnızca YouTube video ve playlist bağlantıları destekleniyor.')
  const validPath = /^\/(watch|playlist|shorts\/[\w-]+|live\/[\w-]+|clip\/[\w-]+)\/?$/.test(url.pathname)
  if (!validPath && !(url.hostname.endsWith('youtu.be') && /^\/[\w-]+\/?$/.test(url.pathname))) throw new Error('Bir video, Shorts veya playlist bağlantısı kullanın.')
  url.protocol = 'https:'
  return url.toString()
}

function cleanEntry(entry) {
  if (!entry?.id || !/^[\w-]{11}$/.test(entry.id) || ['[Private video]', '[Deleted video]'].includes(entry.title) || ['private', 'premium_only', 'subscriber_only', 'needs_auth'].includes(entry.availability)) return null
  return {
    videoId: entry.id,
    url: `https://www.youtube.com/watch?v=${entry.id}`,
    title: String(entry.title || 'Başlıksız video').slice(0, 500),
    channel: String(entry.channel || entry.uploader || '').slice(0, 200),
    thumbnail: `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`,
    duration: Number(entry.duration) || 0
  }
}

function friendlyError(error) {
  const text = error.message || String(error)
  if (/sign in|bot|confirm you.re not/i.test(text)) return 'YouTube oturum doğrulaması istiyor. Ayarlar’dan cookies.txt dosyası seçip yeniden deneyin.'
  if (/private video|video unavailable|removed|not available/i.test(text)) return 'Bu video kullanılamıyor, kaldırılmış veya erişime kapalı.'
  if (/No space|disk full|not enough space/i.test(text)) return 'İndirme klasörünün bulunduğu diskte yeterli boş alan yok.'
  if (/permission denied|access is denied|EACCES|EPERM/i.test(text)) return 'Dosya erişimi engellendi. İndirme klasörünü ve dosyanın başka bir uygulamada açık olup olmadığını kontrol edin.'
  if (/timed out|unable to download|ENOTFOUND|ECONNRESET|fetch failed/i.test(text)) return 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.'
  return text.replace(/ERROR:\s*/g, '').slice(-1600)
}

class Downloads {
  constructor(store, tools, directory, notify) {
    this.store = store
    this.tools = tools
    this.directory = directory
    this.notify = notify
    this.previews = new Map()
    this.current = null
    this.analysisChild = null
    this.analysisController = null
    this.analysisDone = null
    this.analyzing = false
    this.stopping = false
    this.verifications = new Map()
    this.verificationController = new AbortController()
    this.historyChecking = false
    this.workDirectory = path.join(path.dirname(directory), 'download-work')
    fs.mkdirSync(directory, { recursive: true })
    fs.mkdirSync(this.workDirectory, { recursive: true })
  }

  busy() { return Boolean(this.current || this.analyzing || this.verifications.size) }

  async analyze({ url, playlist = false } = {}) {
    if (this.analyzing) throw new Error('Başka bir bağlantı inceleniyor. Tamamlanmasını bekleyin.')
    url = youtubeURL(url)
    if (typeof playlist !== 'boolean') throw new Error('Geçersiz playlist seçimi.')
    if (new URL(url).pathname === '/playlist' && !playlist) throw new Error('Playlist bağlantısı için Playlistteki videoları seç seçeneğini işaretleyin.')
    this.analyzing = true
    const controller = new AbortController()
    this.analysisController = controller
    let finished
    this.analysisDone = new Promise(resolve => { finished = resolve })
    this.notify()
    try {
      await abortable(this.tools.ensure(), controller.signal)
      const args = [...this.tools.arguments(), '--dump-single-json', '--skip-download', '--flat-playlist', '--playlist-end', '2000', playlist ? '--yes-playlist' : '--no-playlist', '--', url]
      const { stdout } = await runProcess(this.store.data.tools.ytdlp.path, args, { timeout: 180000, signal: controller.signal, onSpawn: child => { this.analysisChild = child } })
      const info = JSON.parse(stdout)
      const rawEntries = info.entries || [info]
      const entries = [...new Map(rawEntries.filter(Boolean).map(cleanEntry).filter(Boolean).map(entry => [entry.videoId, entry])).values()]
      if (!entries.length) throw new Error('Bu bağlantıda indirilebilir bir video bulunamadı.')
      const id = randomUUID()
      const result = { id, title: info.title || entries[0].title, isPlaylist: Boolean(info.entries), entries, skipped: rawEntries.length - entries.length, truncated: Number(info.playlist_count) > 2000 }
      if (this.previews.size > 10) this.previews.delete(this.previews.keys().next().value)
      this.previews.set(id, result)
      return result
    } catch (error) {
      throw new Error(friendlyError(error))
    } finally {
      this.analyzing = false
      this.analysisChild = null
      this.analysisController = null
      finished()
      this.tools.cleanup()
      this.notify()
    }
  }

  async enqueue({ previewId, videoIds, mode, quality, audioQuality } = {}) {
    const preview = this.previews.get(previewId)
    if (!preview) throw new Error('Bağlantıyı yeniden inceleyin.')
    if (!Array.isArray(videoIds) || !videoIds.length || videoIds.length > 2000) throw new Error('İndirmek için en az bir video seçin.')
    if (!['video', 'audio'].includes(mode) || !['best', '2160', '1440', '1080', '720', '480'].includes(quality) || !['320', '192', '128'].includes(audioQuality)) throw new Error('Geçersiz indirme biçimi.')
    const selectedIds = new Set(videoIds)
    const selected = preview.entries.filter(entry => selectedIds.has(entry.videoId))
    if (!selected.length) throw new Error('Geçerli bir video seçin.')
    const settings = this.store.data.settings
    fs.mkdirSync(settings.downloadDirectory, { recursive: true })
    fs.accessSync(settings.downloadDirectory, fs.constants.W_OK)
    let added = 0
    let duplicates = 0
    for (const entry of selected) {
      const key = `${entry.videoId}:${mode}:${mode === 'audio' ? audioQuality : quality}:${settings.downloadDirectory}`
      let existing = this.store.data.jobs.find(job => job.key === key && ['queued', ...activeStatuses].includes(job.status))
      if (!existing) {
        const candidates = this.store.data.jobs.filter(job => job.key === key && job.status === 'completed')
        for (const candidate of candidates) {
          try { await this.verifyCompleted(candidate); existing = candidate; break } catch {}
        }
      }
      if (existing) { duplicates++; continue }
      this.store.data.jobs.unshift({ ...entry, id: randomUUID(), key, mode, quality, audioQuality, directory: settings.downloadDirectory, playlistTitle: preview.isPlaylist ? preview.title : '', status: 'queued', progress: 0, speed: 0, eta: null, createdAt: Date.now(), error: '', filePath: '' })
      added++
    }
    this.store.save()
    this.notify()
    void this.pump()
    return { added, duplicates }
  }

  async cacheThumbnail(job) {
    try {
      const filename = createHash('sha256').update(job.videoId).digest('hex')
      const target = path.join(this.directory, filename)
      if (!fs.existsSync(target)) {
        const response = await fetch(`https://i.ytimg.com/vi/${job.videoId}/mqdefault.jpg`, { signal: AbortSignal.timeout(15000) })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return
        const data = Buffer.from(await response.arrayBuffer())
        if (data.length > 2 * 1024 * 1024) return
        fs.writeFileSync(target, data)
      }
      job.thumbnail = `akis-thumb://cache/${filename}`
      this.store.save()
      this.notify()
    } catch {}
  }

  async pump() {
    if (this.current || this.stopping || this.store.data.queuePaused) return
    const job = [...this.store.data.jobs].reverse().find(item => item.status === 'queued')
    if (!job) { this.tools.cleanup(); return }
    let finished
    const current = { id: job.id, child: null, cancelled: false, committing: false, controller: new AbortController(), done: new Promise(resolve => { finished = resolve }) }
    this.current = current
    job.status = 'preparing'
    job.error = ''
    this.store.save()
    this.notify()
    void this.cacheThumbnail(job)
    let work
    let invalidOutput = false
    try {
      await abortable(this.tools.ensure(), current.controller.signal)
      if (current.cancelled || this.stopping) return
      fs.mkdirSync(job.directory, { recursive: true })
      work = this.jobWorkDirectory(job.id)
      fs.mkdirSync(work, { recursive: true })
      const toolPaths = { ...this.store.data.tools }
      current.output = ''
      const quality = job.mode === 'audio' ? `mp3-${job.audioQuality}` : job.quality === 'best' ? 'en-iyi' : `${job.quality}p`
      const args = [...this.tools.arguments(), '--no-playlist', '--no-simulate', '--newline', '--progress', '--progress-delta', '0.5', '--windows-filenames', '--trim-filenames', '160', '--continue', '--no-overwrites', '--paths', work, '--output', `%(title).100B [%(id)s] (${quality}).%(ext)s`, '--print', 'before_dl:__META__%(.{title,channel,duration})j', '--print', 'after_move:__FILE__%(filepath)j', '--progress-template', 'download:__PROGRESS__%(progress)j', '--progress-template', 'postprocess:__POST__%(progress.status)j', '--embed-metadata', '--no-write-info-json', '--no-write-description', '--no-write-subs', '--no-write-auto-subs', '--no-write-playlist-metafiles']
      if (job.mode === 'audio') args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', `${job.audioQuality}K`, '--postprocessor-args', 'ExtractAudio:-ar 44100', '--embed-thumbnail', '--convert-thumbnails', 'jpg')
      else {
        const cap = job.quality === 'best' ? '' : `[height<=${job.quality}]`
        args.push('-f', `bv${cap}[ext=mp4]+ba[ext=m4a]/b${cap}[ext=mp4]/bv${cap}+ba/b${cap}`, '--format-sort', 'res,vcodec:h264,acodec:aac', '--merge-output-format', 'mp4', '--remux-video', 'mp4')
      }
      args.push('--', job.url)
      job.status = 'downloading'
      this.notify()
      await runProcess(toolPaths.ytdlp.path, args, {
        signal: current.controller.signal,
        onSpawn: child => {
          current.child = child
          if (current.cancelled || this.stopping) void stopProcess(child)
        },
        onLine: line => {
          if (current.cancelled || this.stopping) return
          try {
            if (line.startsWith('__PROGRESS__')) {
              const progress = JSON.parse(line.slice(12))
              const total = progress.total_bytes || progress.total_bytes_estimate || 0
              job.progress = total ? Math.min(100, progress.downloaded_bytes / total * 100) : 0
              job.speed = progress.speed || 0
              job.eta = progress.eta ?? null
              job.status = progress.status === 'finished' ? 'processing' : 'downloading'
            } else if (line.startsWith('__POST__')) job.status = 'processing'
            else if (line.startsWith('__FILE__')) current.output = JSON.parse(line.slice(8))
            else if (line.startsWith('__META__')) {
              const meta = JSON.parse(line.slice(8))
              job.title = meta.title || job.title
              job.channel = meta.channel || job.channel
              job.duration = Number(meta.duration) || job.duration
            } else return
            this.notify()
          } catch {}
        }
      })
      if (current.cancelled || this.stopping) return
      if (!current.output || !fs.existsSync(current.output)) throw new Error('İndirme tamamlandı ancak çıktı dosyası bulunamadı.')
      const relative = path.relative(work, current.output)
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Çıktı dosyası geçici indirme klasörünün dışında.')
      job.status = 'verifying'
      job.speed = 0
      job.eta = null
      this.notify()
      const media = await validateMedia(current.output, job, path.join(path.dirname(toolPaths.ffmpeg.path), 'ffprobe.exe'), { signal: current.controller.signal, onSpawn: child => { current.child = child } })
      if (current.cancelled || this.stopping) return
      current.committing = true
      job.status = 'saving'
      this.notify()
      job.filePath = await publishMedia(current.output, job.directory, media)
      job.media = media
      job.size = media.size
      job.fileMtime = fs.statSync(job.filePath).mtimeMs
      job.status = 'completed'
      job.progress = 100
      job.completedAt = Date.now()
    } catch (error) {
      invalidOutput = error.code === 'INVALID_MEDIA' || /Invalid data|moov atom|Invalid frame|Error.*(?:decod|muxing|encoding|processing)|Unsupported codec/i.test(error.message)
      if (!current.cancelled && !this.stopping) {
        job.status = 'failed'
        job.error = friendlyError(error)
        if (!this.tools.ready()) this.store.data.queuePaused = true
      }
    } finally {
      job.speed = 0
      job.eta = null
      if (this.stopping && activeStatuses.includes(job.status)) job.status = 'queued'
      else if (current.cancelled) job.status = 'cancelled'
      try {
        if (work && (job.status === 'completed' || invalidOutput)) this.removeWorkDirectory(work)
        this.store.save()
        this.notify()
      } finally {
        this.current = null
        finished()
        if (!this.stopping) setImmediate(() => void this.pump())
      }
    }
  }

  async cancel(id) {
    const job = this.get(id)
    if (this.current?.id === id) {
      if (this.current.committing) throw new Error('Dosya kaydediliyor. Tamamlanmasını bekleyin.')
      this.current.cancelled = true
      job.status = 'cancelling'
      this.store.save()
      this.notify()
      const current = this.current
      current.controller.abort()
      await current.done
    } else if (job.status === 'queued') {
      job.status = 'cancelled'
      this.store.save()
      this.notify()
    }
  }

  retry(id) {
    const job = this.get(id)
    if (this.current?.id === id) throw new Error('İptal işlemi tamamlanana kadar bekleyin.')
    if (!['failed', 'cancelled'].includes(job.status)) return
    job.status = 'queued'
    job.progress = 0
    job.error = ''
    this.store.save()
    this.notify()
    void this.pump()
  }

  remove(id) {
    const job = this.get(id)
    if (this.current?.id === id || ['queued', ...activeStatuses].includes(job.status)) throw new Error('Önce indirmeyi iptal edin.')
    this.store.data.jobs = this.store.data.jobs.filter(item => item.id !== id)
    this.store.save()
    this.removeWorkDirectory(this.jobWorkDirectory(id))
    this.notify()
  }

  pause(paused) {
    if (typeof paused !== 'boolean') throw new Error('Geçersiz kuyruk ayarı.')
    this.store.data.queuePaused = paused
    this.store.save()
    this.notify()
    if (!paused) void this.pump()
  }

  get(id) {
    const job = this.store.data.jobs.find(item => item.id === id)
    if (!job) throw new Error('İndirme kaydı bulunamadı.')
    return job
  }

  jobWorkDirectory(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Geçersiz indirme kaydı.')
    return path.join(this.workDirectory, id)
  }

  removeWorkDirectory(directory) {
    const relative = path.relative(path.resolve(this.workDirectory), path.resolve(directory))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Geçersiz geçici indirme klasörü.')
    try { fs.rmSync(directory, { recursive: true, force: true }) } catch {}
  }

  verifyCompleted(job) {
    const existing = this.verifications.get(job.id)
    if (existing) return existing
    const pending = this.checkCompleted(job).finally(() => { this.verifications.delete(job.id); this.tools.cleanup() })
    this.verifications.set(job.id, pending)
    return pending
  }

  async checkCompleted(job) {
    try {
      if (job.status !== 'completed' || !job.filePath) throw new Error('Tamamlanmış dosya bulunamadı.')
      const stat = await fs.promises.lstat(job.filePath)
      const signal = this.verificationController.signal
      if (stat.isFile() && !stat.isSymbolicLink() && job.media?.sha256 && stat.size === job.media.size && stat.mtimeMs === job.fileMtime) {
        if (await fileDigest(job.filePath, signal) !== job.media.sha256) throw new Error('Dosyanın içeriği indirmeden sonra değişmiş. Yeniden indirin.')
        return job
      }
      await abortable(this.tools.ensure(), signal)
      const media = await validateMedia(job.filePath, job, path.join(path.dirname(this.store.data.tools.ffmpeg.path), 'ffprobe.exe'), { signal })
      if (job.media?.sha256 && job.media.sha256 !== media.sha256) throw new Error('Dosyanın içeriği indirmeden sonra değişmiş. Yeniden indirin.')
      job.media = media
      job.size = media.size
      job.fileMtime = stat.mtimeMs
      this.store.save()
      this.notify()
      return job
    } catch (error) {
      if (error.name === 'AbortError') throw error
      job.status = 'failed'
      job.error = error.code === 'ENOENT' ? 'Dosya taşınmış veya silinmiş. Yeniden indirin.' : friendlyError(error)
      this.store.save()
      this.notify()
      throw new Error(job.error)
    }
  }

  async verifyHistory() {
    if (this.historyChecking || this.stopping || !this.tools.ready()) return
    this.historyChecking = true
    this.notify()
    try {
      for (const job of [...this.store.data.jobs]) {
        if (this.stopping) break
        if (job.status !== 'completed') continue
        let unchanged = false
        try {
          const stat = fs.lstatSync(job.filePath)
          unchanged = job.media?.sha256 && stat.isFile() && !stat.isSymbolicLink() && stat.size === job.media.size && stat.mtimeMs === job.fileMtime
        } catch {}
        if (!unchanged) {
          try { await this.verifyCompleted(job) } catch {}
        }
      }
    } finally { this.historyChecking = false; this.notify() }
  }

  async shutdown() {
    this.stopping = true
    this.analysisController?.abort()
    this.verificationController.abort()
    const current = this.current
    if (current && !current.committing) current.controller.abort()
    await Promise.allSettled([current?.done, this.analysisDone, ...this.verifications.values()])
    this.store.save()
  }
}

module.exports = { Downloads, youtubeURL, friendlyError }
