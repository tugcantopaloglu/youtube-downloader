# Üçüncü taraf yazılımlar

Akış kaynak kodu MIT lisanslıdır. Electron ve Electron Updater kendi MIT lisanslarıyla dağıtılır. Electron dağıtımındaki `LICENSE.electron.txt` ve `LICENSES.chromium.html` dosyaları kurulumda korunur. ZIP okuma için MIT lisanslı yauzl kullanılır.

İndirme araçları kurulum dosyasına gömülmez; ilk açılışta doğrudan geliştiricilerinin GitHub sürümlerinden indirilir. Kullanılan sürüm ve SHA-256 bilgisi yerel durum dosyasında tutulur.

| Araç | Kaynak | Lisans bilgisi |
| --- | --- | --- |
| yt-dlp | https://github.com/yt-dlp/yt-dlp | Kaynak Unlicense; Windows paketinin içerdiği bileşenler GPLv3+ ve başka lisanslara tabidir. https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt |
| FFmpeg / FFprobe | https://github.com/yt-dlp/FFmpeg-Builds | Seçilen GPL derlemesinin lisans ve kaynak bilgisi indirilen arşivde korunur. https://ffmpeg.org/legal.html |
| Deno | https://github.com/denoland/deno | MIT; üçüncü taraf bildirimleri ilgili projenin kaynak deposunda yer alır. |

Kaynak kodları ve ilgili lisanslar yukarıdaki proje depolarından erişilebilir.
