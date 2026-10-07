const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { runProcess } = require('./process.cjs')

class InvalidMediaError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidMediaError'
    this.code = 'INVALID_MEDIA'
  }
}

async function fileDigest(file, signal) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk)
  return hash.digest('hex')
}

async function validateMedia(file, job, ffprobe, options = {}) {
  const stat = await fs.promises.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new InvalidMediaError('İndirilen dosya boş veya geçerli bir medya dosyası değil.')
  const expectedExtension = job.mode === 'audio' ? '.mp3' : '.mp4'
  if (path.extname(file).toLowerCase() !== expectedExtension) throw new InvalidMediaError(`Seçilen ${expectedExtension.slice(1).toUpperCase()} biçiminde bir dosya üretilemedi.`)
  const descriptor = await fs.promises.open(file, 'r')
  let prefix
  try {
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await descriptor.read(buffer, 0, buffer.length, 0)
    prefix = buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '').trimStart()
  } finally { await descriptor.close() }
  if (/^<(?:!doctype|html|head|body|script|\?xml)\b/i.test(prefix)) throw new InvalidMediaError('Sunucu medya yerine HTML/XML döndürdü. Dosya kaydedilmedi.')
  let probe
  try {
    probe = await runProcess(ffprobe, ['-v', 'error', '-count_packets', '-show_entries', 'format=format_name,duration,size:stream=codec_type,codec_name,width,height,duration,bit_rate,nb_read_packets:stream_disposition=attached_pic', '-of', 'json', '-protocol_whitelist', 'file,pipe', '-i', file], { ...options, timeout: Math.max(60000, Math.ceil(stat.size / (2 * 1024 * 1024)) * 1000), maxOutput: 1024 * 1024 })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new InvalidMediaError('İndirilen dosya okunamıyor veya eksik. Geçerli bir medya dosyası kaydedilmedi.')
  }
  let info
  try { info = JSON.parse(probe.stdout) } catch { throw new InvalidMediaError('Medya dosyasının biçimi doğrulanamadı.') }
  if (probe.stderr.trim()) throw new InvalidMediaError('Dosyada bozuk veya eksik medya paketleri bulundu. Dosya kaydedilmedi.')
  const streams = info.streams || []
  const audio = streams.filter(stream => stream.codec_type === 'audio' && stream.codec_name && stream.codec_name !== 'unknown' && Number(stream.nb_read_packets) > 0)
  const video = streams.filter(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic && Number(stream.width) > 0 && Number(stream.height) > 0 && Number(stream.nb_read_packets) > 0)
  const formats = (info.format?.format_name || '').split(',')
  const duration = Number(info.format?.duration)
  if (!Number.isFinite(duration) || duration <= 0 || !audio.length) throw new InvalidMediaError('Dosyada geçerli ve boş olmayan bir ses akışı bulunamadı.')
  if (job.mode === 'audio') {
    if (!formats.includes('mp3') || audio.some(stream => stream.codec_name !== 'mp3') || video.length) throw new InvalidMediaError('Dosyanın gerçek biçimi seçilen MP3 ile eşleşmiyor.')
    if (audio.some(stream => Math.abs(Number(stream.bit_rate) - Number(job.audioQuality) * 1000) > 2000)) throw new InvalidMediaError('MP3 bit hızı seçilen kaliteyle eşleşmiyor.')
  } else {
    if (!formats.includes('mp4') || !video.length) throw new InvalidMediaError('Dosyada geçerli bir MP4 görüntü ve ses akışı bulunamadı.')
    if (job.quality !== 'best' && video.some(stream => Number(stream.height) > Number(job.quality))) throw new InvalidMediaError('Video çözünürlüğü seçilen sınırı aşıyor.')
  }
  const expectedDuration = Number(job.duration)
  if (expectedDuration > 0 && duration < expectedDuration - Math.max(2, expectedDuration * 0.02)) throw new InvalidMediaError('İndirilen dosyanın süresi eksik. Dosya tamamlanmış olarak kaydedilmedi.')
  const sha256 = await fileDigest(file, options.signal)
  const finalStat = await fs.promises.stat(file)
  if (finalStat.size !== stat.size || finalStat.mtimeMs !== stat.mtimeMs) throw new InvalidMediaError('Dosya doğrulama sırasında değişti. Yeniden indirin.')
  return { format: job.mode === 'audio' ? 'mp3' : 'mp4', duration, width: video[0]?.width || 0, height: video[0]?.height || 0, audioBitrate: Number(audio[0].bit_rate) || 0, size: stat.size, sha256 }
}

async function publishMedia(source, directory, media) {
  await fs.promises.mkdir(directory, { recursive: true })
  const parsed = path.parse(source)
  const temporary = path.join(directory, `.downtube-${randomUUID()}.tmp`)
  try {
    await fs.promises.copyFile(source, temporary, fs.constants.COPYFILE_EXCL)
    const descriptor = await fs.promises.open(temporary, 'r+')
    try { await descriptor.sync() } finally { await descriptor.close() }
    if ((await fs.promises.stat(temporary)).size !== media.size || await fileDigest(temporary) !== media.sha256) throw new Error('Kaydedilen dosyanın doğrulaması başarısız oldu.')
    for (let index = 0; index < 10000; index++) {
      const name = index ? `${parsed.name} (${index + 1})${parsed.ext}` : parsed.base
      const destination = path.join(directory, name)
      try {
        await fs.promises.link(temporary, destination)
        return destination
      } catch (error) {
        if (error.code === 'EEXIST') {
          const existing = await fs.promises.lstat(destination)
          if (existing.isFile() && !existing.isSymbolicLink() && existing.size === media.size && await fileDigest(destination) === media.sha256) return destination
          continue
        }
        if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EINVAL'].includes(error.code)) throw error
        try {
          await fs.promises.copyFile(temporary, destination, fs.constants.COPYFILE_EXCL)
          if ((await fs.promises.stat(destination)).size !== media.size || await fileDigest(destination) !== media.sha256) throw new Error('Dosya hedef klasöre eksiksiz kaydedilemedi.')
          return destination
        } catch (copyError) {
          if (copyError.code === 'EEXIST') continue
          await fs.promises.rm(destination, { force: true }).catch(() => {})
          throw copyError
        }
      }
    }
    throw new Error('Dosya için kullanılabilir bir ad bulunamadı.')
  } finally { await fs.promises.rm(temporary, { force: true }) }
}

module.exports = { InvalidMediaError, fileDigest, validateMedia, publishMedia }
