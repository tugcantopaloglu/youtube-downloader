# DownTube

Windows 10/11 x64 için Türkçe YouTube video, playlist ve MP3 indirme uygulaması. Electron arayüzü, yt-dlp indirme motoru, FFmpeg/FFprobe ve Deno kullanır.

## Kullanım

GitHub Releases sayfasından `DownTube-Setup-1.0.3.exe` dosyasını indirip açın. Kurulum kullanıcı hesabına yapılır; Python, Node.js, FFmpeg veya yönetici yetkisi gerekmez. Başlat menüsünden veya masaüstündeki DownTube kısayolundan çalıştırın.

İlk açılışta gerekli araçlar GitHub üzerinden indirilir. İlk hazırlık internet bağlantısı gerektirir. Sonraki açılışlarda hazır araçlar kullanılır; güncelleme kontrolü başarısız olursa mevcut araçlarla çalışmaya devam edilir.

1. Video veya playlist bağlantısını yapıştırın. Playlist bağlantıları otomatik algılanır; video bağlantısındaki playlisti dahil etmek istemiyorsanız `Playlistteki videoları seç` seçimini kaldırın.
2. Video (MP4) veya ses (MP3) ve kaliteyi seçin.
3. Gerekirse indirme klasörünü değiştirin ve `İndir` düğmesine basın. Tek video doğrudan kuyruğa eklenir.
4. Playlistte `Videoları seç` düğmesine basıp istediğiniz videoları işaretleyin ve indirin. İlerleme Kuyruk ekranında, tamamlanan dosyalar küçük resimleriyle İndirilenler ekranında görünür.

Kuyruk sırayla çalışır. Bekletme sıradaki indirmeleri durdurur; devam eden dosya tamamlanır. İptal edilen veya başarısız indirmeler yeniden denenebilir. Geçici alandaki `.part` dosyaları korunur ve yeniden indirmede kullanılabilir. Uygulama kapanınca tamamlanmamış işler sonraki açılışta tekrar kuyruğa alınır. Aynı video, biçim, kalite ve klasör için halen doğrulanmış bir dosya veya kuyruk kaydı varsa tekrar eklenmez.

## Uzun indirme kuyrukları

Videolar tek tek indirilir; iki iş arasında 5–10 saniye beklenir. Metadata istekleri arasında 0,75 saniye beklenir ve aynı bağlantının önizlemesi 10 dakika boyunca yeniden kullanılabilir. HTTP, parça ve metadata hatalarında yt-dlp sınırlı sayıda, giderek artan sürelerle yeniden dener. Eksik parçalar atlanarak tamamlanmış dosya üretilmez.

Geçici bağlantı hatalarında kuyruk 30 saniye, 2 dakika ve 5 dakika sonra aynı işi yeniden dener. YouTube `429` veya geçici istek sınırı bildirirse devam eden istekler durdurulur; kuyruk 15, 30 ve 60 dakika bekledikten sonra otomatik devam eder. Bekleme boyunca kalan videolara istek gönderilmez. Bu süreler uygulamanın toparlanma politikasıdır; YouTube tarafından garanti edilen sınırlar değildir. Tekrarlanan hatalarda otomatik denemeler durur ve kullanıcıdan müdahale istenir.

`403` yanıtında yeni bir indirme bağlantısı alınarak bir kez yeniden denenir; devam ederse kuyruk bekletilir. Bot/oturum doğrulaması, dolu disk veya erişim sorunu otomatik döngüye girmez. Sorun giderildikten sonra `Devam et` aynı işi tekrar kuyruğa alır. Silinmiş, özel veya erişilemeyen bir video diğer indirmeleri durdurmadan atlanır.

Bilgisayar çevrimdışı olduğunu bildirirse YouTube'a istek gönderilmeden bağlantı beklenir. Bağlantı geri geldiğinde kuyruk otomatik devam eder; manuel bekletme ve YouTube bekleme süresi korunur. Kuyruk, indirme parçaları ve bekleme bitişi diske kaydedilir; uygulama yeniden açıldığında devam eder. Uygulamanın açık olması gerekir.

Varsayılan olarak aktif kuyruk sırasında Windows'un otomatik uyuması önlenir; ekran kapanabilir. Bu tercih Ayarlar'dan kapatılabilir. Kuyruk bittiğinde veya bekletildiğinde uyku engeli kaldırılır. YouTube doğrulama veya erişim kısıtlamaları nedeniyle kesintisiz indirme garanti edilemez.

## Dosya doğrulaması

İndirmeler uygulamanın geçici alanında hazırlanır. Hedef klasöre yalnızca doğrulanan MP3 veya MP4 kaydedilir; küçük resim, açıklama, HTML, altyazı ve indirme parçaları bu klasöre aktarılmaz.

FFprobe dosyanın tamamındaki paketleri tarar. Gerçek kapsayıcı biçimi, boş olmayan ses/görüntü akışları, süre, MP3 bit hızı ve video çözünürlük sınırı kontrol edilir. MP3 kapak görseli ses dosyasının içinde olabilir. Boş dosya, HTML/XML yanıtı, yanlış biçim veya bozuk paketler indirme hatası sayılır. Hedefe kopyalanan dosyanın SHA-256 özeti de doğrulanır; mevcut kullanıcı dosyaları üzerine yazılmaz.

Video çözünürlüğü bir üst sınırdır. Örneğin 1080p seçildiğinde kaynak 720p ise 720p indirilir. Kuyruk tamamlanan dosyanın gerçek çözünürlüğünü gösterir. MP3 çıktısı seçilen 128, 192 veya 320 kbps ile üretilir.

Dosyalar açılmadan ve tekrar indirme kararı verilmeden önce kontrol edilir. İlk açılışta eski geçmiş kayıtları doğrulanır; geçersiz dosyalar başarılı indirme olarak tutulmaz. Doğrulanmış bir dosyanın içeriği sonradan değişirse yeniden indirme istenir.

Geçmişten kaldırma medya dosyasını silmez. Dosya taşınmış veya silinmişse açma işleminde anlaşılır bir hata gösterilir. Playlist önizlemesi ilk 2000 kayıtla sınırlıdır; erişilemeyen ve tekrar eden kayıtlar atlanır. Canlı yayınların kayıt işlemi yayının süresine bağlıdır.

YouTube oturum doğrulaması isterse Ayarlar’dan Netscape biçiminde bir `cookies.txt` dosyası seçilebilir. Dosya yerel bilgisayarda kullanılır; kaynak koduna veya GitHub’a eklenmez.

## Otomatik güncellemeler

yt-dlp, projenin düzenli kullanıcılar için önerdiği nightly kanalından günlük kontrol edilir. FFmpeg ve Deno haftalık kontrol edilir. `Şimdi kontrol et` üç aracı da hemen kontrol eder. İndirilen dosyaların SHA-256 özeti GitHub sürüm bilgisindeki özetle veya projenin checksum dosyasıyla doğrulanır. Arşivler geçici klasörde açılıp çalıştırılabilir dosyalar kontrol edildikten sonra yeni sürüme geçilir. Devam eden indirmeler önceki araç sürümlerini kullanmaya devam eder.

Uygulama güncellemeleri varsayılan olarak `tugcantopaloglu/youtube-downloader` deposundan alınır. Ayarlar’da `kullanıcı/depo` veya GitHub depo adresi girilebilir. Depo herkese açık olmalıdır; erişim tokenı uygulamaya gömülmez. Otomatik uygulama güncellemesi açılışta ve altı saatte bir kontrol edilir. Yeni sürüm arka planda indirilir ve normal kapanışta yüklenir. `Yeniden başlat ve yükle` düğmesi kuyruk boşken kullanılabilir. Mevcut araçlar hazırsa indirme kuyruğu güncelleme kontrolünü beklemeden başlar.

Otomatik güncelleme kapalıysa `Şimdi kontrol et` yalnızca yeni sürümü bulur. İndirme için `Güncellemeyi indir`, kurulum için `Yeniden başlat ve yükle` kullanılır. Tercih kapatıldığında daha önce indirilen güncelleme kapanışta otomatik yüklenmez. Checksum’u uyuşmayan, Windows uygulaması olmayan, eski veya önizleme sürümleri kurulmaz. Devam eden indirme, dosya doğrulama veya araç güncellemesi varken yeniden başlatma engellenir.

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

Çıktı `release/DownTube-Setup-1.0.3.exe` dosyasıdır. `npm run pack` kurulum yapmadan açılabilen `release/win-unpacked/DownTube.exe` klasörünü üretir. Güncellemeler için normal kurulum dosyasını kullanın.

## GitHub üzerinden sürüm yayınlama

Bu projeyi `tugcantopaloglu/youtube-downloader` deposuna gönderin. `.github/workflows/release.yml`, `v*` etiketi gönderildiğinde Windows kurulumunu oluşturup GitHub Release’e yükler. `GITHUB_TOKEN` workflow tarafından sağlanır.

```powershell
npm version patch
git push origin main --follow-tags
```

`npm version` sürümü artırır ve `v1.0.1` gibi bir etiket oluşturur. Sürüm etiketinin `package.json` sürümüyle eşleşmesi zorunludur. `npm run release` ayrıca yerel bilgisayardan `GH_TOKEN` ortam değişkeniyle kullanılabilir. Tokenı kaynak dosyasına yazmayın.

Otomatik güncelleme için Release’te `DownTube-Setup-<sürüm>.exe`, `.exe.blockmap` ve `latest.yml` birlikte bulunmalıdır. Workflow bunları üretir. Farklı bir hesap veya depo kullanılacaksa `package.json` içindeki `repository` ve `build.publish` alanlarını değiştirin. Ayarlar’dan değiştirilen depo, kurulu uygulamanın güncelleme kaynağını değiştirir.

Kurulum dosyası şu anda kod imzası olmadan üretilir. Dağıtımda imzalama kullanılacaksa Electron Builder’ın `CSC_LINK` ve `CSC_KEY_PASSWORD` secret’larını yapılandırın. İmzasız dosya ilk açılışta Windows SmartScreen uyarısı gösterebilir.

## Yerel veriler

Ayarlar, kuyruk ve geçmiş `%APPDATA%/akis-downloader/state.json` içinde tutulur. Bir önceki geçerli durum `.bak` dosyasına yedeklenir. İndirme araçları `tools`, küçük resimler `thumbnails`, indirme parçaları `download-work` alt klasöründedir. Doğrulanmış MP4/MP3 dosyaları kullanıcının seçtiği klasöre kaydedilir. Araçların eski sürümleri devam eden işlemler bitene kadar saklanır; uygulama boşta kaldığında eski araç sürümleri temizlenir.

Önceki sürümlerden güncellemede ayarları ve geçmişi korumak için kurulum kimliği ve yerel veri klasörü korunur. Yeni kurulumların varsayılan indirme klasörü `Downloads/DownTube` olur; önceden seçilmiş klasörler aynı kalır.

Uygulama kodunda yorum veya otomatik test dosyaları bulunmaz. Sözdizimi kontrolü, paketleme ve elle kullanım doğrulaması için komutlar sağlanır. Üçüncü taraf lisansları için `THIRD_PARTY.md` dosyasına bakın.
