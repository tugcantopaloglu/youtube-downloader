const fs = require('node:fs')

function validateExecutable(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 128) throw new Error('İndirilen dosya geçerli bir Windows uygulaması değil.')
  const descriptor = fs.openSync(file, 'r')
  try {
    const header = Buffer.alloc(64)
    fs.readSync(descriptor, header, 0, header.length, 0)
    const offset = header.readUInt32LE(60)
    if (header.toString('ascii', 0, 2) !== 'MZ' || offset < 64 || offset + 26 > stat.size) throw new Error('İndirilen dosya Windows çalıştırılabilir biçiminde değil.')
    const signature = Buffer.alloc(26)
    fs.readSync(descriptor, signature, 0, signature.length, offset)
    if (signature.readUInt32LE(0) !== 0x4550 || ![0x10b, 0x20b].includes(signature.readUInt16LE(24))) throw new Error('İndirilen Windows dosyasının başlığı geçersiz.')
  } finally { fs.closeSync(descriptor) }
}

module.exports = { validateExecutable }
