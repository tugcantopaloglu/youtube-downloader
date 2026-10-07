const fs = require('node:fs')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')
const yauzl = require('yauzl')

async function extractArchive(archive, directory) {
  const root = path.resolve(directory)
  const zip = await yauzl.openPromise(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true })
  let expanded = 0
  try {
    for await (const entry of zip.eachEntry()) {
      const type = (entry.externalFileAttributes >>> 16) & 0xf000
      if (type === 0xa000 || /[:\0]/.test(entry.fileName)) throw new Error('Arşiv güvenli olmayan bir dosya içeriyor.')
      const target = path.resolve(root, entry.fileName)
      const relative = path.relative(root, target)
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Arşivde geçersiz dosya yolu bulundu.')
      expanded += entry.uncompressedSize
      if (expanded > 2 * 1024 * 1024 * 1024) throw new Error('Arşiv boyutu izin verilen sınırı aşıyor.')
      if (entry.fileName.endsWith('/')) await fs.promises.mkdir(target, { recursive: true })
      else {
        await fs.promises.mkdir(path.dirname(target), { recursive: true })
        const input = await zip.openReadStreamPromise(entry)
        await pipeline(input, fs.createWriteStream(target, { flags: 'wx' }))
      }
    }
  } finally { zip.close() }
}

module.exports = { extractArchive }
