import './style.css'

const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  queue: '<path d="M4 6h16M4 12h10M4 18h6m8-7v9m-3-3 3 3 3-3"/>',
  library: '<rect x="4" y="4" width="6" height="16" rx="1.5"/><rect x="14" y="4" width="6" height="16" rx="1.5"/><path d="M7 8v4m10-4v4"/>',
  settings: '<path d="m9 4 1-2h4l1 2 3 2 2 1v4l-2 1v4l-3 2-1 2h-4l-1-2-3-2-2-1v-4l2-1V6z"/><circle cx="12" cy="11" r="3"/>',
  minus: '<path d="M5 12h14"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/>',
  link: '<path d="m10 13 4-4m-6 5-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 4 2-2a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(2 1) scale(.9)"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M9 4H4v17h17v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v5h5"/>'
}

const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`
const esc = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const api = window.akis
const main = document.querySelector('#main')
let state
let page = 'download'
let preview = null
let selection = new Set()
let format = 'video'
let analyzing = false
let enqueueing = false
let libraryFilter = 'all'
let libraryLimit = 60
let queueLimit = 50
let librarySignature = ''
let search = ''
let toastTimer
let downloadURL = ''
let playlistMode = false

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon) })
}

function toast(message, error = false) {
  const element = document.querySelector('#toast')
  element.textContent = message
  element.className = `toast visible${error ? ' error' : ''}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => element.classList.remove('visible'), error ? 6500 : 4000)
}

async function action(callback) {
  try { return await callback() } catch (error) { toast(error.message, true) }
}

function duration(seconds) {
  if (!seconds) return 'Süre bilinmiyor'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const remainder = Math.floor(seconds % 60)
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function bytes(size) {
  if (!size) return '0 B'
  const unit = Math.min(3, Math.floor(Math.log(size) / Math.log(1024)))
  return `${(size / 1024 ** unit).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB'][unit]}`
}

const completed = () => state.jobs.filter(job => job.status === 'completed' && job.media?.sha256)
const activeStatuses = ['preparing', 'downloading', 'processing', 'verifying', 'saving', 'cancelling']
const unfinished = () => state.jobs.filter(job => job.status === 'queued' || activeStatuses.includes(job.status))
const qualityLabel = job => job.mode === 'audio' ? `MP3 · ${job.media?.audioBitrate ? Math.round(job.media.audioBitrate / 1000) : job.audioQuality} kbps` : `MP4 · ${job.media?.height ? `${job.media.height}p` : job.quality === 'best' ? 'En iyi kalite' : `${job.quality}p'ye kadar`}`
const date = timestamp => new Date(timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

function image(entry, className = '') {
  const valid = /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/mqdefault\.jpg$/.test(entry.thumbnail) || /^akis-thumb:\/\/cache\/[a-f0-9]{64}$/.test(entry.thumbnail)
  return `<div class="thumbnail ${className}">${valid ? `<img src="${esc(entry.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon(entry.mode === 'audio' ? 'music' : 'video')}${entry.duration ? `<span class="duration">${duration(entry.duration)}</span>` : ''}</div>`
}

function header(title, description = '', extra = '') {
  return `<div class="page-heading"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>${extra}</div>`
}

function empty(title, description, name = 'download') {
  return `<div class="empty-state"><div class="empty-icon">${icon(name)}</div><h3>${title}</h3><p>${description}</p></div>`
}

function toolsBanner() {
  const tools = state.tools
  if (tools.ready && !tools.error) return ''
  return `<div class="tools-banner ${tools.error ? 'warning' : ''}"><span class="${tools.busy ? 'spinner' : 'banner-icon'}">${tools.busy ? '' : icon('refresh')}</span><div><strong>${esc(tools.message)}</strong><p>${tools.error ? esc(tools.error) : 'İlk açılışta gerekli araçlar otomatik indirilir. Ayrı bir kurulum yapmana gerek yok.'}</p>${tools.progress !== null ? `<div class="progress-track"><div style="--progress:${tools.progress}%"></div></div>` : ''}</div>${tools.error && !tools.busy ? '<button class="button small" data-action="tools">Yeniden dene</button>' : ''}</div>`
}

function downloadPage() {
  return `${header('İndir')}
    <div id="tools-banner">${toolsBanner()}</div>
    <section class="download-panel">
      <label class="field-label" for="url">YouTube bağlantısı</label>
      <form id="link-form"><div class="url-field">${icon('link')}<input type="url" id="url" value="${esc(downloadURL)}" placeholder="Video veya playlist bağlantısını yapıştırın" autocomplete="off" required aria-label="YouTube bağlantısı"><button type="submit" id="analyze-button" class="button primary">${icon('download')}İndir</button></div></form>
      <div class="link-options" id="playlist-options" ${playlistMode || downloadURL.includes('list=') ? '' : 'hidden'}><label class="checkbox-label"><input type="checkbox" id="playlist" ${playlistMode ? 'checked' : ''}>Playlistteki videoları seç</label></div>
      <div class="format-row"><div class="format-switch" role="group" aria-label="İndirme biçimi"><button class="format-button ${format === 'video' ? 'active' : ''}" data-format="video">${icon('video')}Video <small>MP4</small></button><button class="format-button ${format === 'audio' ? 'active' : ''}" data-format="audio">${icon('music')}Ses <small>MP3</small></button></div><label class="quality-field"><span id="quality-label">Video kalitesi</span><select id="quality" aria-label="Video kalitesi"><option value="best">En iyi kalite</option><option value="2160">2160p · 4K</option><option value="1440">1440p · 2K</option><option value="1080">1080p · Full HD</option><option value="720">720p · HD</option><option value="480">480p</option></select><select id="audio-quality" aria-label="MP3 kalitesi" hidden><option value="320">320 kbps · Yüksek</option><option value="192">192 kbps · Dengeli</option><option value="128">128 kbps · Küçük dosya</option></select></label></div>
      <div class="directory-row"><div class="directory-icon">${icon('folder')}</div><div class="directory-info"><span>İndirme klasörü</span><strong id="download-directory" title="${esc(state.settings.downloadDirectory)}">${esc(state.settings.downloadDirectory)}</strong></div><button class="icon-button" data-action="open-directory" aria-label="İndirme klasörünü aç" title="Klasörü aç">${icon('external')}</button><button class="button small" data-action="directory">Değiştir</button></div>
      <p class="quiet-note">Seçilen video çözünürlüğü üst sınırdır; kaynak daha düşük kalitede olabilir.</p>
    </section>
    <section id="preview-section" class="preview-section" hidden></section>
    <section class="recent-section"><div class="section-heading"><h2>Son indirilenler</h2><button class="text-button" data-page="library">Tümünü göster ${icon('arrow')}</button></div><div id="recent-content"></div></section>
    `
}

function renderPreview() {
  const section = document.querySelector('#preview-section')
  if (!section) return
  section.hidden = !preview
  if (!preview) return
  section.innerHTML = `<div class="section-heading"><div><div class="eyebrow">${preview.isPlaylist ? 'PLAYLIST' : 'VİDEO'}</div><h2>${esc(preview.title)}</h2><p>${preview.entries.length} video${preview.skipped ? ` · ${preview.skipped} erişilemeyen veya tekrar eden kayıt atlandı` : ''}${preview.truncated ? ' · İlk 2000 kayıt gösteriliyor' : ''}</p></div><button class="icon-button" data-action="clear-preview" aria-label="Önizlemeyi kapat">${icon('close')}</button></div><div class="selection-toolbar"><label class="checkbox-label"><input type="checkbox" id="select-all" ${selection.size === preview.entries.length ? 'checked' : ''}>Tümünü seç</label><span id="selected-count">${selection.size} video seçildi</span></div><div class="preview-list">${preview.entries.map(entry => `<label class="preview-item"><input type="checkbox" data-select="${entry.videoId}" ${selection.has(entry.videoId) ? 'checked' : ''}>${image(entry)}<div class="item-info"><strong>${esc(entry.title)}</strong><span>${esc(entry.channel || 'YouTube')} · ${duration(entry.duration)}</span></div></label>`).join('')}</div><div class="preview-footer"><span>Seçtiğin videolar sırayla indirilir.</span><button class="button primary" id="enqueue-button" data-action="enqueue" ${selection.size === 0 || enqueueing ? 'disabled' : ''}>${icon('download')}${enqueueing ? 'Ekleniyor' : `${selection.size} ${format === 'audio' ? 'MP3' : 'video'} indir`}</button></div>`
}

function updateSelection() {
  const all = document.querySelector('#select-all')
  if (all) { all.checked = selection.size === preview.entries.length; all.indeterminate = selection.size > 0 && selection.size < preview.entries.length }
  const count = document.querySelector('#selected-count')
  if (count) count.textContent = `${selection.size} video seçildi`
  const button = document.querySelector('#enqueue-button')
  if (button) { button.disabled = selection.size === 0 || enqueueing; button.innerHTML = `${icon('download')}${enqueueing ? 'Ekleniyor' : `${selection.size} ${format === 'audio' ? 'MP3' : 'video'} indir`}` }
}

function card(job) {
  return `<article class="media-card">${image(job)}<div class="media-card-body"><div class="media-card-label"><span>${job.mode === 'audio' ? 'MP3' : 'MP4'}</span><small>${date(job.completedAt)}</small></div><h3 title="${esc(job.title)}">${esc(job.title)}</h3><p>${esc(job.channel || 'YouTube')} · ${bytes(job.size)}</p><div class="card-actions"><button class="text-button" data-action="open" data-id="${job.id}">${icon('play')}Dosyayı aç</button><button class="icon-button" data-action="reveal" data-id="${job.id}" title="Klasörde göster" aria-label="Klasörde göster">${icon('folder')}</button><button class="icon-button" data-action="remove" data-id="${job.id}" title="Geçmişten kaldır" aria-label="Geçmişten kaldır">${icon('trash')}</button></div></div></article>`
}

function renderRecent() {
  const element = document.querySelector('#recent-content')
  if (!element) return
  const jobs = completed().slice(0, 3)
  element.innerHTML = jobs.length ? `<div class="media-grid">${jobs.map(card).join('')}</div>` : `<div class="recent-empty"><div class="empty-mini-icon">${icon('library')}</div><strong>Henüz tamamlanan indirme yok.</strong><span class="empty-counter">0 dosya</span></div>`
}

function queuePage() {
  return `${header('İndirme kuyruğu', '', `<button class="button" data-action="pause" id="pause-button"></button>`)}<div id="tools-banner">${toolsBanner()}</div><div id="queue-summary" class="queue-summary"></div><div id="queue-content"></div>`
}

function queueRow(job) {
  const labels = { queued: state.queuePaused ? 'Bekletiliyor' : 'Sırada', preparing: 'Hazırlanıyor', downloading: 'İndiriliyor', processing: 'Dosya hazırlanıyor', verifying: 'Dosya doğrulanıyor', saving: 'Kaydediliyor', cancelling: 'İptal ediliyor', completed: 'Tamamlandı', failed: 'İndirilemedi', cancelled: 'İptal edildi' }
  const active = activeStatuses.includes(job.status)
  const stageDetail = { preparing: 'İndirme araçları hazırlanıyor', processing: 'Ses ve video işleniyor', verifying: 'Dosya biçimi, ses ve görüntü paketleri kontrol ediliyor', saving: 'Doğrulanan dosya seçilen klasöre kaydediliyor', cancelling: 'Devam eden işlem durduruluyor' }
  const detail = job.error || (active ? `${stageDetail[job.status] || `${Math.round(job.progress)}%`}${job.speed ? ` · ${bytes(job.speed)}/sn` : ''}${job.eta ? ` · ${duration(job.eta)} kaldı` : ''}` : qualityLabel(job))
  return `<article class="queue-item ${job.status}">${image(job)}<div class="queue-item-body"><div class="queue-title"><strong title="${esc(job.title)}">${esc(job.title)}</strong><span class="status-label ${job.status}">${labels[job.status]}</span></div><p class="queue-detail">${esc(detail)}</p>${active ? `<div class="progress-track ${job.status !== 'downloading' ? 'indeterminate' : ''}"><div style="--progress:${Math.max(0, Math.min(100, job.progress))}%"></div></div>` : ''}</div><div class="queue-actions">${job.status === 'completed' ? `<button class="icon-button" data-action="open" data-id="${job.id}" title="Dosyayı aç" aria-label="Dosyayı aç">${icon('play')}</button><button class="icon-button" data-action="reveal" data-id="${job.id}" title="Klasörde göster" aria-label="Klasörde göster">${icon('folder')}</button>` : ['failed', 'cancelled'].includes(job.status) ? `<button class="button small" data-action="retry" data-id="${job.id}">${icon('refresh')}Yeniden dene</button>` : `<button class="icon-button" data-action="cancel" data-id="${job.id}" title="İndirmeyi iptal et" aria-label="İndirmeyi iptal et" ${['saving', 'cancelling'].includes(job.status) ? 'disabled' : ''}>${icon('close')}</button>`}${!active && job.status !== 'queued' ? `<button class="icon-button" data-action="remove" data-id="${job.id}" title="Kaydı kaldır" aria-label="Kaydı kaldır">${icon('trash')}</button>` : ''}</div></article>`
}

function renderQueue() {
  const element = document.querySelector('#queue-content')
  if (!element) return
  const jobs = state.jobs
  document.querySelector('#queue-summary').innerHTML = `<span><strong>${unfinished().length}</strong> bekleyen / devam eden</span><span><strong>${completed().length}</strong> tamamlanan</span><span><strong>${jobs.filter(job => job.status === 'failed').length}</strong> başarısız</span>`
  const pause = document.querySelector('#pause-button')
  pause.innerHTML = `${icon(state.queuePaused ? 'play' : 'pause')}${state.queuePaused ? 'Kuyruğu devam ettir' : 'Kuyruğu beklet'}`
  const priority = job => activeStatuses.includes(job.status) ? 2 : job.status === 'queued' ? 1 : 0
  const ordered = jobs.map((job, index) => ({ job, index })).sort((a, b) => priority(b.job) - priority(a.job) || (a.job.status === 'queued' ? b.index - a.index : a.index - b.index)).map(item => item.job)
  element.innerHTML = jobs.length ? `<div class="queue-list">${ordered.slice(0, queueLimit).map(queueRow).join('')}</div>${jobs.length > queueLimit ? `<div class="load-more"><span>${Math.min(queueLimit, jobs.length)} / ${jobs.length} kayıt</span><button class="button small" data-action="more-queue">Daha fazlasını göster</button></div>` : ''}${state.queuePaused ? '<p class="quiet-note">Devam eden indirme bitirilir; sıradaki indirmeler bekletilir.</p>' : ''}` : empty('Kuyruğun boş.', 'Yeni indirme ekranından bir bağlantı ekleyerek başlayabilirsin.', 'queue')
}

function libraryPage() {
  return `${header('İndirilenler', '', `<button class="button" data-action="open-directory">${icon('folder')}Klasörü aç</button>`)}<div class="library-toolbar"><div class="filter-tabs"><button data-filter="all" class="${libraryFilter === 'all' ? 'active' : ''}">Tümü</button><button data-filter="video" class="${libraryFilter === 'video' ? 'active' : ''}">Videolar</button><button data-filter="audio" class="${libraryFilter === 'audio' ? 'active' : ''}">MP3</button></div><label class="search-field">${icon('search')}<input id="library-search" placeholder="Dosya veya kanal ara" value="${esc(search)}" aria-label="İndirilen dosyalarda ara"></label></div><div id="library-content"></div><p class="quiet-note">${icon('file')}Geçmişten kaldırmak, bilgisayarındaki dosyayı silmez.</p>`
}

function renderLibrary() {
  const element = document.querySelector('#library-content')
  if (!element) return
  const jobs = completed().filter(job => (libraryFilter === 'all' || job.mode === libraryFilter) && `${job.title} ${job.channel}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
  librarySignature = `${completed().length}:${completed()[0]?.id || ''}:${state.historyChecking ? 1 : 0}`
  element.innerHTML = jobs.length ? `<div class="library-count">${jobs.length} dosya</div><div class="media-grid">${jobs.slice(0, libraryLimit).map(card).join('')}</div>${jobs.length > libraryLimit ? `<div class="load-more"><span>${Math.min(libraryLimit, jobs.length)} / ${jobs.length} dosya</span><button class="button small" data-action="more-library">Daha fazlasını göster</button></div>` : ''}` : empty(state.historyChecking ? 'İndirme geçmişi kontrol ediliyor.' : completed().length ? 'Eşleşen dosya bulunamadı.' : 'Henüz indirme yok.', state.historyChecking ? 'Doğrulanan MP4 ve MP3 dosyaları burada görünecek.' : completed().length ? 'Aramayı veya filtreyi değiştirin.' : 'Tamamlanan video ve MP3 dosyaları burada görünür.', 'library')
}

function settingsPage() {
  return `${header('Ayarlar')}
    <section class="settings-panel"><div class="settings-heading">${icon('folder')}<h2>İndirme tercihleri</h2></div><div class="settings-row"><div><strong>İndirme klasörü</strong><p id="settings-directory">${esc(state.settings.downloadDirectory)}</p></div><button class="button small" data-action="directory">Klasör seç</button></div><div class="settings-row"><div><strong>YouTube oturum dosyası</strong><p id="cookies-path">${state.settings.cookiesFile ? esc(state.settings.cookiesFile) : 'YouTube giriş isterse Netscape biçiminde cookies.txt seçebilirsin.'}</p></div><div class="inline-actions"><button class="button small" data-action="cookies">Dosya seç</button><button class="icon-button" data-action="clear-cookies" aria-label="Oturum dosyasını kaldır" title="Oturum dosyasını kaldır">${icon('close')}</button></div></div></section>
    <section class="settings-panel"><div class="settings-heading">${icon('refresh')}<h2>İndirme araçları</h2><span class="subtle-pill">Otomatik kurulum</span></div><div class="settings-row"><div><strong>Araçları otomatik güncelle</strong><p>yt-dlp günlük; FFmpeg ve Deno haftalık kontrol edilir.</p></div><label class="switch"><input type="checkbox" id="auto-tools" ${state.settings.autoUpdateTools ? 'checked' : ''} aria-label="Araçları otomatik güncelle"><span></span></label></div><div id="tool-versions"></div><div class="settings-bottom"><span id="tools-message"></span><button class="button small" data-action="tools" id="tools-button">${icon('refresh')}Şimdi kontrol et</button></div></section>
    <section class="settings-panel"><div class="settings-heading">${icon('download')}<h2>Uygulama güncellemeleri</h2><span class="version-tag">v${esc(state.version)}</span></div><div class="settings-row"><div><strong>Uygulamayı otomatik güncelle</strong><p>Yeni sürüm arka planda indirilir, uygulama kapanınca yüklenir.</p></div><label class="switch"><input type="checkbox" id="auto-app" ${state.settings.autoUpdateApp ? 'checked' : ''} aria-label="Uygulamayı otomatik güncelle"><span></span></label></div><form id="repository-form" class="repository-form"><label for="repository">GitHub güncelleme deposu</label><div class="repository-field"><span>github.com /</span><input id="repository" value="${esc(state.settings.githubRepository)}" required aria-label="GitHub güncelleme deposu"><button class="button small" type="submit">Kaydet</button></div><p>Herkese açık depoda yayınlanan Windows kurulum sürümleri kullanılır.</p></form><div class="settings-bottom"><span id="update-message"></span><div class="inline-actions"><button class="button small" id="update-button" data-action="update">${icon('refresh')}Şimdi kontrol et</button><button class="button small" id="download-update" data-action="download-update" hidden>Güncellemeyi indir</button><button class="button primary small" id="install-update" data-action="install-update" hidden>Yeniden başlat ve yükle</button></div></div></section>`
}

function renderSettingsStatus() {
  const versions = document.querySelector('#tool-versions')
  if (!versions) return
  versions.innerHTML = `<div class="tool-versions">${[['ytdlp', 'yt-dlp', 'İndirme motoru'], ['ffmpeg', 'FFmpeg', 'Video ve ses işleme'], ['deno', 'Deno', 'YouTube desteği']].map(([id, name, detail]) => `<div><strong>${name}</strong><small>${detail}</small><span title="${esc(state.tools.versions[id])}">${esc(state.tools.versions[id].split(' ')[0].replace(/^(N-\d+)-.*$/, '$1'))}</span></div>`).join('')}</div>`
  document.querySelector('#tools-message').textContent = state.tools.error || state.tools.message
  document.querySelector('#tools-button').disabled = state.tools.busy
  document.querySelector('#update-message').textContent = state.update.message
  document.querySelector('#update-button').disabled = ['checking', 'downloading', 'development'].includes(state.update.status)
  document.querySelector('#install-update').hidden = state.update.status !== 'downloaded'
  document.querySelector('#download-update').hidden = state.update.status !== 'available'
  document.querySelector('#install-update').disabled = unfinished().length > 0 || state.analyzing || state.tools.busy
  document.querySelector('#settings-directory').textContent = state.settings.downloadDirectory
  document.querySelector('#cookies-path').textContent = state.settings.cookiesFile || 'YouTube giriş isterse Netscape biçiminde cookies.txt seçebilirsin.'
}

function setFormat(mode) {
  format = mode
  document.querySelectorAll('[data-format]').forEach(button => button.classList.toggle('active', button.dataset.format === mode))
  const quality = document.querySelector('#quality')
  if (quality) {
    quality.hidden = mode === 'audio'
    document.querySelector('#audio-quality').hidden = mode === 'video'
    document.querySelector('#quality-label').textContent = mode === 'audio' ? 'MP3 kalitesi' : 'Video kalitesi'
  }
  updateSelection()
}

function renderPage() {
  main.innerHTML = ({ download: downloadPage, queue: queuePage, library: libraryPage, settings: settingsPage })[page]()
  if (page === 'download') {
    document.querySelector('#quality').value = state.settings.quality
    document.querySelector('#audio-quality').value = state.settings.audioQuality
    setFormat(format)
    renderPreview()
    renderRecent()
    updateAnalyzeButton()
  } else if (page === 'queue') renderQueue()
  else if (page === 'library') renderLibrary()
  else renderSettingsStatus()
  document.querySelectorAll('[data-page].nav-item').forEach(button => button.classList.toggle('selected', button.dataset.page === page))
  main.scrollTop = 0
}

function updateAnalyzeButton() {
  const button = document.querySelector('#analyze-button')
  if (button) {
    button.disabled = analyzing || state.analyzing
    button.innerHTML = analyzing || state.analyzing ? '<span class="spinner"></span>Hazırlanıyor' : `${icon('download')}${document.querySelector('#playlist')?.checked ? 'Videoları seç' : 'İndir'}`
    document.querySelectorAll('#url, #playlist, #quality, #audio-quality, [data-format], [data-action="directory"]').forEach(control => { control.disabled = analyzing || state.analyzing })
  }
}

async function enqueueVideos(result, videoIds, options) {
  if (enqueueing) return
  enqueueing = true
  updateSelection()
  try {
    const queued = await api.enqueue({ previewId: result.id, videoIds, ...options })
    toast(`${queued.added} indirme kuyruğa eklendi.${queued.duplicates ? ` ${queued.duplicates} zaten indirilmiş veya sırada.` : ''}`)
    if (queued.added) { preview = null; selection.clear(); downloadURL = ''; playlistMode = false; page = 'queue'; renderPage() }
  } finally { enqueueing = false; updateSelection() }
}

function updateState(next) {
  state = next
  document.querySelector('#queue-count').textContent = unfinished().length
  document.querySelector('#engine-label').textContent = state.tools.ready ? state.tools.busy ? 'Güncelleme kontrolü' : 'İndirmeye hazır' : state.tools.busy ? 'Araçlar indiriliyor' : 'Kurulum gerekli'
  document.querySelector('#engine-dot').className = `status-dot ${state.tools.ready ? 'ready' : state.tools.busy ? 'busy' : 'error'}`
  document.querySelector('#app-version').textContent = `DownTube ${state.version}`
  const banner = document.querySelector('#tools-banner')
  if (banner) banner.innerHTML = toolsBanner()
  const directory = document.querySelector('#download-directory')
  if (directory) { directory.textContent = state.settings.downloadDirectory; directory.title = state.settings.downloadDirectory }
  updateAnalyzeButton()
  if (page === 'download') renderRecent()
  if (page === 'queue') renderQueue()
  if (page === 'library' && librarySignature !== `${completed().length}:${completed()[0]?.id || ''}:${state.historyChecking ? 1 : 0}`) renderLibrary()
  if (page === 'settings') renderSettingsStatus()
}

document.addEventListener('click', event => {
  const navigation = event.target.closest('[data-page]')
  if (navigation) { page = navigation.dataset.page; renderPage(); return }
  const windowButton = event.target.closest('[data-window]')
  if (windowButton) { void action(() => api.window(windowButton.dataset.window)); return }
  const formatButton = event.target.closest('[data-format]')
  if (formatButton) { setFormat(formatButton.dataset.format); void action(() => api.saveSettings({ mode: format })); return }
  const filter = event.target.closest('[data-filter]')
  if (filter) {
    libraryFilter = filter.dataset.filter
    libraryLimit = 60
    document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === libraryFilter))
    renderLibrary()
    return
  }
  const button = event.target.closest('[data-action]')
  if (!button) return
  const id = button.dataset.id
  void action(async () => {
    switch (button.dataset.action) {
      case 'directory': await api.chooseDirectory(); break
      case 'cookies': await api.chooseCookies(); break
      case 'clear-cookies': await api.saveSettings({ cookiesFile: '' }); break
      case 'open-directory': await api.openDirectory(); break
      case 'open': await api.openFile(id); break
      case 'reveal': await api.revealFile(id); break
      case 'cancel': await api.cancel(id); break
      case 'retry': await api.retry(id); break
      case 'remove': await api.remove(id); break
      case 'pause': await api.pause(!state.queuePaused); break
      case 'more-queue': queueLimit += 50; renderQueue(); break
      case 'more-library': libraryLimit += 60; renderLibrary(); break
      case 'tools': {
        button.disabled = true
        const result = await api.checkTools()
        toast(result.error || 'İndirme araçları güncel.', Boolean(result.error))
        break
      }
      case 'update': await api.checkUpdate(); break
      case 'download-update': await api.downloadUpdate(); break
      case 'install-update': await api.installUpdate(); break
      case 'clear-preview': preview = null; selection.clear(); renderPreview(); break
      case 'enqueue': {
        if (!preview) return
        const quality = document.querySelector('#quality').value
        const audioQuality = document.querySelector('#audio-quality').value
        await enqueueVideos(preview, [...selection], { mode: format, quality, audioQuality })
        break
      }
    }
  })
})

document.addEventListener('submit', event => {
  event.preventDefault()
  if (event.target.id === 'link-form') {
    if (analyzing) return
    const url = document.querySelector('#url').value
    const playlist = document.querySelector('#playlist').checked
    const options = { mode: format, quality: document.querySelector('#quality').value, audioQuality: document.querySelector('#audio-quality').value }
    analyzing = true
    updateAnalyzeButton()
    void action(async () => {
      try {
        const result = await api.analyze({ url, playlist })
        if (page === 'download' && document.querySelector('#url').value !== url) {
          toast('Bağlantı değişti. Yeni bağlantıyı inceleyebilirsin.')
          return
        }
        preview = result
        selection = new Set(preview.entries.map(entry => entry.videoId))
        if (!result.isPlaylist) {
          await enqueueVideos(result, result.entries.map(entry => entry.videoId), options)
          return
        }
        if (page === 'download') { renderPreview(); document.querySelector('#preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' }) }
        else toast('Bağlantı hazır. Yeni indirme ekranında seçim yapabilirsin.')
      } finally { analyzing = false; updateAnalyzeButton() }
    })
  } else if (event.target.id === 'repository-form') {
    void action(async () => { await api.saveSettings({ githubRepository: document.querySelector('#repository').value }); toast('Güncelleme deposu kaydedildi.') })
  }
})

document.addEventListener('change', event => {
  const input = event.target
  if (input.matches('[data-select]')) {
    if (input.checked) selection.add(input.dataset.select)
    else selection.delete(input.dataset.select)
    updateSelection()
  } else if (input.id === 'select-all') {
    selection = new Set(input.checked ? preview.entries.map(entry => entry.videoId) : [])
    document.querySelectorAll('[data-select]').forEach(checkbox => { checkbox.checked = input.checked })
    updateSelection()
  } else if (input.id === 'auto-tools' || input.id === 'auto-app') {
    const key = input.id === 'auto-tools' ? 'autoUpdateTools' : 'autoUpdateApp'
    void action(async () => { try { await api.saveSettings({ [key]: input.checked }) } catch (error) { input.checked = state.settings[key]; throw error } })
  } else if (input.id === 'quality' || input.id === 'audio-quality') {
    void action(() => api.saveSettings({ [input.id === 'quality' ? 'quality' : 'audioQuality']: input.value }))
  } else if (input.id === 'playlist') {
    playlistMode = input.checked
    updateAnalyzeButton()
  }
})

document.addEventListener('input', event => {
  if (event.target.id === 'library-search') { search = event.target.value; libraryLimit = 60; renderLibrary() }
  if (event.target.id === 'url') {
    downloadURL = event.target.value
    if (preview) { preview = null; selection.clear(); renderPreview() }
    try {
      const url = new URL(event.target.value)
      document.querySelector('#playlist').checked = url.searchParams.has('list') || url.pathname === '/playlist'
    } catch { document.querySelector('#playlist').checked = false }
    playlistMode = document.querySelector('#playlist').checked
    document.querySelector('#playlist-options').hidden = !document.querySelector('#playlist').checked && !event.target.value.includes('list=')
    updateAnalyzeButton()
  }
})

hydrateIcons()
if (api) {
  api.onState(updateState)
  void action(async () => { state = await api.state(); format = state.settings.mode; renderPage(); updateState(state) })
} else {
  main.innerHTML = `${header('DownTube', 'Bu arayüzü kullanmak için DownTube uygulamasını açın.')}<div class="preview-info">Geliştirme için <code>npm run dev</code>, normal kullanım için <code>npm start</code> komutunu çalıştır.</div>`
}
