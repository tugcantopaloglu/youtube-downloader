const { autoUpdater } = require('electron-updater')
const { validateExecutable } = require('./executable.cjs')

function parseRepository(value) {
  const repository = String(value || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/, '')
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/.test(repository) || ['.', '..'].includes(repository.split('/')[1])) throw new Error('GitHub deposunu kullanıcı/depo biçiminde girin.')
  return repository
}

class AppUpdater {
  constructor(app, store, notify, isBusy, engine = autoUpdater) {
    this.app = app
    this.store = store
    this.notify = notify
    this.isBusy = isBusy
    this.engine = engine
    this.pending = null
    this.state = { status: app.isPackaged ? 'idle' : 'development', message: app.isPackaged ? 'Güncellemeler otomatik kontrol edilir' : 'Uygulama güncellemesi kurulu sürümde çalışır', progress: 0, version: '' }
    engine.autoDownload = false
    engine.autoRunAppAfterInstall = true
    engine.allowDowngrade = false
    engine.allowPrerelease = false
    engine.disableWebInstaller = true
    engine.on('checking-for-update', () => this.set({ status: 'checking', message: 'Yeni sürüm kontrol ediliyor' }))
    engine.on('update-available', info => this.set({ status: 'available', message: `${info.version} sürümü kullanılabilir`, version: info.version }))
    engine.on('update-not-available', () => this.set({ status: 'current', message: 'En güncel sürümü kullanıyorsunuz' }))
    engine.on('download-progress', progress => this.set({ status: 'downloading', message: 'Yeni sürüm indiriliyor', progress: progress.percent }))
    engine.on('update-downloaded', info => {
      try {
        validateExecutable(info.downloadedFile)
        this.set({ status: 'downloaded', progress: 100, version: info.version })
        this.applyPreferences()
      } catch (error) {
        engine.autoInstallOnAppQuit = false
        this.set({ status: 'error', message: `Güncelleme dosyası doğrulanamadı: ${error.message}`, progress: 0 })
      }
    })
    engine.on('error', error => {
      engine.autoInstallOnAppQuit = false
      const message = /404|ERR_UPDATER_LATEST_VERSION_NOT_FOUND/.test(error.message) ? 'Depoda henüz yayınlanmış kurulum sürümü bulunamadı' : `Güncelleme kontrol edilemedi: ${error.message.slice(0, 220)}`
      this.set({ status: 'error', message })
    })
    this.applyPreferences()
  }

  set(patch) { Object.assign(this.state, patch); this.notify() }

  applyPreferences() {
    this.engine.autoInstallOnAppQuit = this.store.data.settings.autoUpdateApp && this.state.status !== 'error'
    if (this.state.status === 'downloaded' && this.engine.autoInstallOnAppQuit) this.engine.addQuitHandler()
    if (this.state.status === 'downloaded') this.set({ message: this.store.data.settings.autoUpdateApp ? 'Yeni sürüm hazır. Uygulamayı kapattığınızda yüklenir.' : 'Yeni sürüm hazır. Yüklemek için yeniden başlat ve yükle düğmesini kullanın.' })
    else if (this.state.status === 'idle' && !this.store.data.settings.autoUpdateApp) this.set({ message: 'Otomatik güncelleme kapalı. İsterseniz şimdi kontrol edebilirsiniz.' })
    if (this.app.isPackaged && this.store.data.settings.autoUpdateApp && this.state.status === 'available' && !this.pending) void this.download()
  }

  async check(manual = false) {
    if (!this.app.isPackaged || (!manual && !this.store.data.settings.autoUpdateApp)) return this.state
    if (this.pending) return this.pending
    if (this.state.status === 'downloaded') return this.state
    this.pending = this.performCheck().finally(() => { this.pending = null })
    return this.pending
  }

  async performCheck() {
    try {
      const [owner, repo] = parseRepository(this.store.data.settings.githubRepository).split('/')
      this.engine.setFeedURL({ provider: 'github', owner, repo, private: false })
      const result = await this.engine.checkForUpdates()
      if (result?.updateInfo?.version.includes('-')) {
        this.set({ status: 'current', message: 'Önizleme sürümleri yüklenmez. Kararlı bir sürüm bekleniyor.', version: '' })
        return this.state
      }
      if (result && this.state.status === 'available' && this.store.data.settings.autoUpdateApp) await this.engine.downloadUpdate()
    } catch (error) {
      if (this.state.status !== 'error') this.set({ status: 'error', message: `Güncelleme kontrol edilemedi: ${error.message.slice(0, 220)}` })
    }
    return this.state
  }

  async download() {
    if (this.pending) return this.pending
    if (this.state.status !== 'available') throw new Error('İndirilebilir bir uygulama güncellemesi yok.')
    this.pending = this.engine.downloadUpdate().catch(() => {}).finally(() => { this.pending = null })
    await this.pending
    return this.state
  }

  repositoryChanged() {
    if (this.pending || this.state.status === 'downloaded') throw new Error('Güncelleme işlemi tamamlandıktan ve uygulama yeniden açıldıktan sonra depo değiştirilebilir.')
    this.set({ status: this.app.isPackaged ? 'idle' : 'development', message: this.app.isPackaged ? 'Yeni güncelleme kaynağı kaydedildi' : 'Güncelleme deposu kaydedildi. Uygulama güncellemesi kurulu sürümde çalışır.', version: '', progress: 0 })
  }

  install() {
    if (this.state.status !== 'downloaded') throw new Error('Yüklemeye hazır bir güncelleme yok.')
    if (this.isBusy()) throw new Error('Önce devam eden indirme veya bağlantı incelemesinin bitmesini bekleyin.')
    this.engine.quitAndInstall(true, true)
  }
}

module.exports = { AppUpdater, parseRepository }
