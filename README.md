# Akış

Windows 10/11 x64 için Türkçe YouTube video, playlist ve MP3 indirme uygulaması. Electron arayüzü, yt-dlp indirme motoru, FFmpeg/FFprobe ve Deno kullanır.

## Kullanım

GitHub Releases sayfasından `Akis-Setup-1.0.0.exe` dosyasını indirip açın. Kurulum kullanıcı hesabına yapılır; Python, Node.js, FFmpeg veya yönetici yetkisi gerekmez. Başlat menüsünden veya masaüstündeki Akış kısayolundan çalıştırın.

İlk açılışta gerekli araçlar GitHub üzerinden indirilir. İlk hazırlık internet bağlantısı gerektirir. Sonraki açılışlarda hazır araçlar kullanılır; güncelleme kontrolü başarısız olursa mevcut araçlarla çalışmaya devam edilir.

1. Video veya playlist bağlantısını yapıştırın. Playlist bağlantıları otomatik algılanır; video bağlantısındaki playlisti dahil etmek istemiyorsanız `Playlist olarak aç` seçimini kaldırın.
2. Video (MP4) veya ses (MP3) ve kaliteyi seçin.
3. Kayıt konumunu seçin, bağlantıyı inceleyin ve istediğiniz videoları işaretleyin.
4. İndirmeyi başlatın. İlerleme İndirme kuyruğunda, tamamlanan dosyalar küçük resimleriyle Kütüphanede görünür.

Kuyruk sırayla çalışır. Bekletme sıradaki indirmeleri durdurur; devam eden dosya tamamlanır. İptal edilen veya başarısız indirmeler yeniden denenebilir. `.part` dosyaları korunur ve yeniden indirmede kullanılabilir. Uygulama kapanınca tamamlanmamış işler sonraki açılışta tekrar kuyruğa alınır. Aynı video, biçim, kalite ve klasör için halen mevcut bir dosya veya kuyruk kaydı varsa tekrar eklenmez.

Geçmişten kaldırma medya dosyasını silmez. Dosya taşınmış veya silinmişse açma işleminde anlaşılır bir hata gösterilir. Playlist önizlemesi ilk 2000 kayıtla sınırlıdır; erişilemeyen ve tekrar eden kayıtlar atlanır. Canlı yayınların kayıt işlemi yayının süresine bağlıdır.

YouTube oturum doğrulaması isterse Ayarlar’dan Netscape biçiminde bir `cookies.txt` dosyası seçilebilir. Dosya yerel bilgisayarda kullanılır; kaynak koduna veya GitHub’a eklenmez.

## Otomatik güncellemeler

yt-dlp, projenin düzenli kullanıcılar için önerdiği nightly kanalından günlük kontrol edilir. FFmpeg ve Deno haftalık kontrol edilir. `Şimdi kontrol et` üç aracı da hemen kontrol eder. İndirilen dosyaların SHA-256 özeti GitHub sürüm bilgisindeki özetle veya projenin checksum dosyasıyla doğrulanır. Arşivler geçici klasörde açılıp çalıştırılabilir dosyalar kontrol edildikten sonra yeni sürüme geçilir. Devam eden indirmeler önceki araç sürümlerini kullanmaya devam eder.

Uygulama güncellemeleri varsayılan olarak `tugcantopaloglu/youtube-downloader` deposundan alınır. Ayarlar’da `kullanıcı/depo` veya GitHub depo adresi girilebilir. Depo herkese açık olmalıdır; erişim tokenı uygulamaya gömülmez. Otomatik uygulama güncellemesi açılışta ve altı saatte bir kontrol edilir. Yeni sürüm arka planda indirilir ve normal kapanışta yüklenir. `Yeniden başlat ve yükle` düğmesi kuyruk boşken kullanılabilir.

Uygulama güncellemesi NSIS kurulumuyla yüklenen sürümde çalışır. Geliştirme modunda devre dışıdır. Yayın bulunmaması veya internet hatası indirmeleri engellemez. Güncelleme tercihlerinin ikisi de Ayarlar’dan kapatılabilir.

yt-dlp güncel bağımlılık bilgisi: https://github.com/yt-dlp/yt-dlp#dependencies

## Bilgisayarda geliştirme

Node.js 24 LTS ve npm gereklidir.

```powershell
npm ci
npm start
```

Kaynak klasöründe `Baslat.cmd` dosyasına çift tıklamak da uygulamayı açar; bağımlılıklar eksikse önce `npm ci` çalıştırılır.

Arayüz değişikliklerinin anında görünmesi için:

```powershell
npm run dev
```

JavaScript sözdizimi kontrolü:

```powershell
npm run check
```

Kurulum dosyası oluşturma:

```powershell
npm run dist
```

Çıktı `release/Akis-Setup-1.0.0.exe` dosyasıdır. `npm run pack` kurulum yapmadan açılabilen `release/win-unpacked/Akis.exe` klasörünü üretir. Güncellemeler için normal kurulum dosyasını kullanın.

## GitHub üzerinden sürüm yayınlama

Bu projeyi `tugcantopaloglu/youtube-downloader` deposuna gönderin. `.github/workflows/release.yml`, `v*` etiketi gönderildiğinde Windows kurulumunu oluşturup GitHub Release’e yükler. `GITHUB_TOKEN` workflow tarafından sağlanır.

```powershell
npm version patch
git push origin main --follow-tags
```

`npm version` sürümü artırır ve `v1.0.1` gibi bir etiket oluşturur. Sürüm etiketinin `package.json` sürümüyle eşleşmesi zorunludur. `npm run release` ayrıca yerel bilgisayardan `GH_TOKEN` ortam değişkeniyle kullanılabilir. Tokenı kaynak dosyasına yazmayın.

Otomatik güncelleme için Release’te `Akis-Setup-<sürüm>.exe`, `.exe.blockmap` ve `latest.yml` birlikte bulunmalıdır. Workflow bunları üretir. Farklı bir hesap veya depo kullanılacaksa `package.json` içindeki `repository` ve `build.publish` alanlarını değiştirin. Ayarlar’dan değiştirilen depo, kurulu uygulamanın güncelleme kaynağını değiştirir.

Kurulum dosyası şu anda kod imzası olmadan üretilir. Dağıtımda imzalama kullanılacaksa Electron Builder’ın `CSC_LINK` ve `CSC_KEY_PASSWORD` secret’larını yapılandırın. İmzasız dosya ilk açılışta Windows SmartScreen uyarısı gösterebilir.

## Yerel veriler

Ayarlar, kuyruk ve geçmiş `%APPDATA%/akis-downloader/state.json` içinde tutulur. Bir önceki durum `.bak` dosyasına yedeklenir. İndirme araçları `tools`, küçük resimler `thumbnails` alt klasöründedir. MP4/MP3 dosyaları kullanıcının seçtiği klasöre kaydedilir. Araçların eski sürümleri devam eden işlemler bitene kadar saklanır; uygulama boşta kaldığında eski araç sürümleri temizlenir.

Uygulama kodunda yorum veya otomatik test dosyaları bulunmaz. Sözdizimi kontrolü, paketleme ve elle kullanım doğrulaması için komutlar sağlanır. Üçüncü taraf lisansları için `THIRD_PARTY.md` dosyasına bakın.
