const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, powerSaveBlocker, powerMonitor, autoUpdater: nativeUpdater } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Store } = require('./store.cjs')
const { ToolManager } = require('./tools.cjs')
const { Downloads, friendlyError } = require('./downloads.cjs')
const { AppUpdater, parseRepository } = require('./updater.cjs')

protocol.registerSchemesAsPrivileged([{ scheme: 'akis-thumb', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.setName('DownTube')
const dataDirectory = process.env.AKIS_DATA_DIR && !app.isPackaged ? path.resolve(process.env.AKIS_DATA_DIR) : path.join(app.getPath('appData'), 'akis-downloader')
fs.mkdirSync(dataDirectory, { recursive: true })
app.setPath('userData', dataDirectory)
app.setAppUserModelId('com.tugcantopaloglu.akis')
const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()

let window
let store
let tools
let downloads
let updater
let quitting = false
let quitPrompt = false
let notifyTimer
let powerBlocker = null

function snapshot() {
  return { version: app.getVersion(), settings: store.data.settings, jobs: store.data.jobs, queuePaused: store.data.queuePaused, queueRecovery: downloads.queueState(), analyzing: downloads.analyzing, historyChecking: downloads.historyChecking, tools: tools.snapshot(), update: updater.state }
}

function notify() {
  if (downloads && store) {
    const keepAwake = !quitting && store.data.settings.keepAwake && (downloads.busy() || (!store.data.queuePaused && store.data.jobs.some(job => downloads.pending(job))))
    if (keepAwake && powerBlocker === null) powerBlocker = powerSaveBlocker.start('prevent-app-suspension')
    if (!keepAwake && powerBlocker !== null) { powerSaveBlocker.stop(powerBlocker); powerBlocker = null }
  }
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    if (window && !window.isDestroyed() && updater) window.webContents.send('state-changed', snapshot())
  }, 100)
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Geçersiz uygulama isteği.')
      return { ok: true, value: await callback(...args) }
    } catch (error) { return { ok: false, error: friendlyError(error) } }
  })
}

async function saveSettings(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('Geçersiz ayarlar.')
  const next = { ...store.data.settings }
  for (const key of ['autoUpdateTools', 'autoUpdateApp', 'keepAwake']) {
    if (key in patch) {
      if (typeof patch[key] !== 'boolean') throw new Error('Geçersiz güncelleme ayarı.')
      next[key] = patch[key]
    }
  }
  for (const [key, allowed] of Object.entries({ mode: ['video', 'audio'], quality: ['best', '2160', '1440', '1080', '720', '480'], audioQuality: ['320', '192', '128'] })) {
    if (key in patch) {
      if (!allowed.includes(patch[key])) throw new Error('Geçersiz kalite ayarı.')
      next[key] = patch[key]
    }
  }
  if ('githubRepository' in patch) {
    next.githubRepository = parseRepository(patch.githubRepository)
    if (next.githubRepository !== store.data.settings.githubRepository) updater.repositoryChanged()
  }
  if ('cookiesFile' in patch && patch.cookiesFile === '') next.cookiesFile = ''
  store.data.settings = next
  store.save()
  updater.applyPreferences()
  notify()
  return next
}

function registerHandlers() {
  handle('state', snapshot)
  handle('analyze', options => downloads.analyze(options))
  handle('enqueue', options => downloads.enqueue(options))
  handle('cancel', id => downloads.cancel(id))
  handle('retry', id => downloads.retry(id))
  handle('remove', id => downloads.remove(id))
  handle('pause', paused => downloads.pause(paused))
  handle('network-restored', () => downloads.networkRestored())
  handle('save-settings', saveSettings)
  handle('choose-directory', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'İndirme klasörünü seçin', defaultPath: store.data.settings.downloadDirectory, properties: ['openDirectory', 'createDirectory'] })
    if (!result.canceled) {
      const directory = result.filePaths[0]
      fs.accessSync(directory, fs.constants.W_OK)
      store.data.settings.downloadDirectory = directory
      store.save()
      notify()
      return directory
    }
    return null
  })
  handle('choose-cookies', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Netscape biçiminde cookies.txt dosyasını seçin', filters: [{ name: 'Cookies', extensions: ['txt'] }], properties: ['openFile'] })
    if (!result.canceled) {
      const file = result.filePaths[0]
      const descriptor = fs.openSync(file, 'r')
      const buffer = Buffer.alloc(512)
      fs.readSync(descriptor, buffer, 0, buffer.length, 0)
      fs.closeSync(descriptor)
      if (!/# (?:Netscape )?HTTP Cookie File/.test(buffer.toString('utf8'))) throw new Error('Netscape biçiminde bir cookies.txt dosyası seçin.')
      store.data.settings.cookiesFile = file
      store.save()
      notify()
      return file
    }
    return null
  })
  handle('open-file', async id => {
    const job = await downloads.verifyCompleted(downloads.get(id))
    const error = await shell.openPath(job.filePath)
    if (error) throw new Error(error)
  })
  handle('reveal-file', async id => {
    const job = await downloads.verifyCompleted(downloads.get(id))
    shell.showItemInFolder(job.filePath)
  })
  handle('open-directory', async () => {
    fs.mkdirSync(store.data.settings.downloadDirectory, { recursive: true })
    const error = await shell.openPath(store.data.settings.downloadDirectory)
    if (error) throw new Error(error)
  })
  handle('check-tools', async () => { await tools.check(true); void downloads.pump(); void downloads.verifyHistory(); return tools.snapshot() })
  handle('check-update', () => updater.check(true))
  handle('download-update', () => updater.download())
  handle('install-update', () => updater.install())
  handle('window', action => {
    if (action === 'minimize') window.minimize()
    else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    else if (action === 'close') window.close()
  })
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1120, height: 780, minWidth: 880, minHeight: 620, show: false, frame: false,
    backgroundColor: '#101010', title: 'DownTube', icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  })
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.once('ready-to-show', () => window.show())
  window.on('close', event => {
    if (quitting) return
    event.preventDefault()
    if (quitPrompt) return
    quitPrompt = true
    void (async () => {
      if (downloads.busy() || tools.snapshot().busy) {
        const result = await dialog.showMessageBox(window, { type: 'question', title: 'DownTube kapatılsın mı?', message: 'Devam eden işlemler var.', detail: 'İndirmeler durdurulur ve sonraki açılışta kaldığı yerden devam eder.', buttons: ['Açık tut', 'Kapat'], defaultId: 0, cancelId: 0 })
        if (result.response === 0) { quitPrompt = false; return }
      }
      quitting = true
      await downloads.shutdown()
      store.save()
      app.quit()
    })()
  })
  if (!app.isPackaged && process.env.AKIS_DEV_URL === 'http://127.0.0.1:5173') await window.loadURL(process.env.AKIS_DEV_URL)
  else await window.loadFile(path.join(__dirname, '../dist-ui/index.html'))
}

if (locked) {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus() } })
  app.whenReady().then(async () => {
    const directory = app.getPath('userData')
    store = new Store(directory, app.getPath('downloads'))
    tools = new ToolManager(store, path.join(directory, 'tools'), notify, () => downloads?.busy())
    downloads = new Downloads(store, tools, path.join(directory, 'thumbnails'), notify, () => net.isOnline())
    updater = new AppUpdater(app, store, notify, () => downloads.busy() || tools.snapshot().busy || store.data.jobs.some(job => downloads.pending(job)))
    nativeUpdater.on('before-quit-for-update', () => { quitting = true; store.save() })
    protocol.handle('akis-thumb', request => {
      const url = new URL(request.url)
      const filename = url.pathname.slice(1)
      if (url.hostname !== 'cache' || !/^[a-f0-9]{64}$/.test(filename)) return new Response('', { status: 404 })
      const target = path.join(directory, 'thumbnails', filename)
      if (!fs.existsSync(target)) return new Response('', { status: 404 })
      return new Response(fs.readFileSync(target), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' } })
    })
    registerHandlers()
    await createWindow()
    powerMonitor.on('resume', () => { downloads.networkRestored(); notify() })
    void downloads.pump()
    void tools.check().then(() => { void downloads.pump(); void downloads.verifyHistory() })
    setTimeout(() => void updater.check(), 8000)
    setInterval(() => { void tools.check(); void updater.check() }, 6 * 60 * 60 * 1000).unref()
  }).catch(error => { dialog.showErrorBox('DownTube başlatılamadı', error.message); app.quit() })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', event => {
    if (!quitting && window && !window.isDestroyed()) { event.preventDefault(); window.close() }
  })
}
