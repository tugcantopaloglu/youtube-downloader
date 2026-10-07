const fs = require('node:fs')
const path = require('node:path')

class Store {
  constructor(directory, downloadsDirectory) {
    fs.mkdirSync(directory, { recursive: true })
    this.file = path.join(directory, 'state.json')
    this.defaults = {
      downloadDirectory: path.join(downloadsDirectory, 'DownTube'),
      mode: 'video',
      quality: '1080',
      audioQuality: '192',
      autoUpdateTools: true,
      autoUpdateApp: true,
      keepAwake: true,
      githubRepository: 'tugcantopaloglu/youtube-downloader',
      cookiesFile: ''
    }
    let saved
    this.persisted = ''
    for (const file of [this.file, `${this.file}.bak`]) {
      try {
        const serialized = fs.readFileSync(file, 'utf8')
        const candidate = JSON.parse(serialized)
        if (candidate.schema === 1 && Array.isArray(candidate.jobs)) {
          saved = candidate
          this.persisted = serialized
          break
        }
      } catch {}
    }
    this.data = {
      schema: 1,
      settings: { ...this.defaults, ...saved?.settings },
      jobs: saved?.jobs || [],
      tools: saved?.tools || {},
      toolsCheckedAt: saved?.toolsCheckedAt || 0,
      queuePaused: saved?.queuePaused ?? false,
      nextDownloadAt: saved?.nextDownloadAt || 0,
      queueRecovery: { until: 0, reason: '', message: '', rateLimitCount: 0, ...saved?.queueRecovery }
    }
    for (const job of this.data.jobs) {
      if (['downloading', 'processing', 'preparing', 'verifying', 'saving'].includes(job.status)) {
        job.status = 'queued'
        job.progress = 0
        job.speed = 0
        job.error = ''
      }
      if (job.status === 'cancelling') job.status = 'cancelled'
    }
    this.save()
  }

  save() {
    const temporary = `${this.file}.tmp`
    const serialized = JSON.stringify(this.data)
    fs.writeFileSync(temporary, serialized, 'utf8')
    if (this.persisted) fs.writeFileSync(`${this.file}.bak`, this.persisted, 'utf8')
    fs.renameSync(temporary, this.file)
    this.persisted = serialized
  }
}

module.exports = { Store }
