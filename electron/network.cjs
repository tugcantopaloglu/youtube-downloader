const fs = require('node:fs')
const { pipeline } = require('node:stream/promises')
const { Readable, Transform } = require('node:stream')
const { createHash } = require('node:crypto')

const headers = { 'User-Agent': 'Akis-Downloader/1.0', Accept: 'application/vnd.github+json' }

async function request(url, timeout = 30000) {
  if (new URL(url).protocol !== 'https:') throw new Error('Güvenli olmayan indirme adresi.')
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) })
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new Error('GitHub istek sınırına ulaşıldı. Daha sonra yeniden deneyin.')
    if (response.status === 404) throw new Error('GitHub deposu veya yayınlanmış sürüm bulunamadı.')
    throw new Error(`Sunucu yanıtı: ${response.status}`)
  }
  return response
}

async function latestRelease(repository) {
  return (await request(`https://api.github.com/repos/${repository}/releases/latest`)).json()
}

async function expectedDigest(release, asset) {
  if (/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) return asset.digest.slice(7).toLowerCase()
  const sums = release.assets.find(item => ['SHA2-256SUMS', 'checksums.sha256', `${asset.name}.sha256sum`].includes(item.name))
  if (!sums) throw new Error('Dosya doğrulama bilgisi bulunamadı; indirme uygulanmadı.')
  const contents = await (await request(sums.browser_download_url)).text()
  const line = contents.split(/\r?\n/).find(item => item.trim().endsWith(asset.name))
  const match = line?.match(/^[a-f0-9]{64}/i)
  if (!match) throw new Error('Dosya doğrulama bilgisi okunamadı.')
  return match[0].toLowerCase()
}

async function downloadVerified(asset, destination, digest, onProgress) {
  const response = await request(asset.browser_download_url, 15 * 60 * 1000)
  if (/(?:text\/html|application\/(?:xhtml\+xml|xml))/i.test(response.headers.get('content-type') || '')) throw new Error('Sunucu indirme dosyası yerine HTML/XML döndürdü.')
  const hash = createHash('sha256')
  let received = 0
  let lastReport = 0
  const tracker = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length
      hash.update(chunk)
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now()
        onProgress?.(Math.min(100, received / asset.size * 100))
      }
      callback(null, chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(response.body), tracker, fs.createWriteStream(destination, { flags: 'wx' }))
    if (hash.digest('hex') !== digest || (asset.size && received !== asset.size)) throw new Error('İndirilen dosyanın doğrulaması başarısız oldu.')
    onProgress?.(100)
  } catch (error) {
    fs.rmSync(destination, { force: true })
    throw error
  }
}

module.exports = { request, latestRelease, expectedDigest, downloadVerified }
