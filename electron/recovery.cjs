const connectionDelays = [30000, 120000, 300000]
const rateLimitDelays = [15 * 60000, 30 * 60000, 60 * 60000]

function failureKind(error) {
  const text = error.message || String(error)
  if (error.code === 'INVALID_MEDIA') return 'permanent'
  if (['ENOSPC', 'EACCES', 'EPERM'].includes(error.code) || /No space|disk full|not enough space|ENOSPC|permission denied|access is denied|EACCES|EPERM/i.test(text)) return 'storage'
  if (/(?:HTTP (?:Error |error )?|status(?: code)?[ :]+)429\b|too many requests|rate[ -]?limit|This content isn.t available, try again later/i.test(text)) return 'rate-limit'
  if (/private video|deleted video|video (?:has been )?removed|members.only|not available in your country/i.test(text)) return 'permanent'
  if (/sign[ -]?in|confirm you.re not a bot|bot verification|login required|authentication required|cookies.*(?:expired|invalid)/i.test(text)) return 'authentication'
  if (/(?:HTTP (?:Error |error )?|status(?: code)?[ :]+)403\b|403 Forbidden/i.test(text)) return 'forbidden'
  if (/video unavailable|video is unavailable|not available|requested format is not available|unsupported URL|HTTP Error (?:404|410)\b/i.test(text)) return 'permanent'
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error.code) || /timed? out|timeout|zaman aşım|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|fetch failed|network is unreachable|temporary failure|connection (?:reset|refused|aborted)|remote end closed|unable to (?:download|connect)|(?:HTTP (?:Error |error )?|status(?: code)?[ :]+)5\d\d\b/i.test(text)) return 'connection'
  return 'permanent'
}

function recoveryPlan(kind, attempt) {
  if (kind === 'rate-limit') return { delay: rateLimitDelays[attempt - 1] || 0, message: 'YouTube istek sınırına ulaşıldı. Kalan indirmeler korunuyor.' }
  if (kind === 'connection') return { delay: connectionDelays[attempt - 1] || 0, message: 'Bağlantı kurulamadı. İndirme parçaları ve kuyruk korunuyor.' }
  if (kind === 'forbidden') return { delay: attempt === 1 ? 30000 : 0, message: 'YouTube indirme bağlantısını reddetti. Bağlantı yeniden alınacak.' }
  if (kind === 'authentication') return { delay: 0, message: 'YouTube oturum doğrulaması istiyor. Ayarlar’dan geçerli cookies.txt dosyası seçip kuyruğu devam ettirin.' }
  return { delay: 0, message: 'Dosya kaydedilemiyor. İndirme klasörünü, boş disk alanını ve erişim izinlerini kontrol edip kuyruğu devam ettirin.' }
}

module.exports = { failureKind, recoveryPlan }
