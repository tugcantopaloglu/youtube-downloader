# DownTube

DownTube is a Windows 10/11 x64 desktop app for downloading YouTube videos,
playlists and MP3 audio. It uses Electron, yt-dlp, FFmpeg, FFprobe and Deno.
The application interface is in Turkish. The Graphite Mono theme uses gray
surfaces, white accents and monospace text for links, paths, versions and counters.

## Installation and use

Download the Windows installer from [GitHub Releases](https://github.com/tugcantopaloglu/youtube-downloader/releases).
Installation is per user and does not require administrator access, Python,
Node.js or a separate FFmpeg installation. Open DownTube from the Start menu or
desktop shortcut.

The first launch downloads tools from GitHub and needs an internet connection.
Later launches reuse installed tools. A failed update check does not prevent
their continued use.

1. Paste a video or playlist URL. Playlist URLs are detected automatically.
   Clear the playlist selection if you only want the video in a combined URL.
2. Choose MP4 video or MP3 audio and the quality setting.
3. Choose the output folder and start downloading. A single video enters the
   queue immediately. For playlists, select the videos before adding them.
4. Follow queue progress and find completed files in the download library.

The queue processes one video at a time. Pausing prevents the next job from
starting while the current file finishes. Failed or cancelled jobs can be retried.
Partial files stay in the temporary workspace for reuse. Interrupted jobs return
to the queue after a restart. Existing verified files and matching queued jobs
are not added twice for the same video, format, quality and folder.

## Long queues and recovery

The downloader waits 5 to 10 seconds between jobs and 0.75 seconds between
metadata requests. Link previews are cached for 10 minutes. yt-dlp uses bounded
retries; missing fragments are not silently skipped to produce a completed file.

Temporary connection failures retry after 30 seconds, 2 minutes and 5 minutes.
YouTube HTTP 429 pauses remaining requests for 15, 30 and 60 minutes. These are
application policies, not guaranteed YouTube limits. Exhausting the retry
allowance requires user action.

HTTP 403 gets one retry with a refreshed URL. Authentication, disk space and
permission failures pause the queue until resolved. Removed, private or
unavailable videos are skipped without stopping other jobs. When authentication
is required, choose a local Netscape-format `cookies.txt` file in Settings.
Cookies are not added to source control or embedded in the application.

When Windows reports an offline connection, the queue waits before sending more
requests. It resumes while preserving manual pauses and rate-limit cooldowns.
Queue state, partial files and cooldown deadlines persist across restarts. The
app must remain open to download or resume jobs.

An active queue prevents automatic system sleep by default while allowing the
display to turn off. Settings can disable this. The blocker is released when the
queue finishes or pauses. YouTube restrictions can still interrupt downloading.

## File verification

Files are prepared in a temporary directory. Only verified MP4 or MP3 media goes
into the selected folder. Thumbnails, HTML, descriptions, subtitles and partial
files are not copied there.

FFprobe scans packets and checks the actual container, nonempty streams,
duration, MP3 bitrate and video resolution limit. Empty files, HTML/XML,
incorrect formats and corrupt packets fail verification. Copies are checked
again with SHA-256. Existing user files are not overwritten or removed when a
download fails to create its output file.

Video resolution is an upper limit: a 720p source stays 720p when 1080p is selected.
The queue shows the actual resolution. MP3 output uses 128, 192 or 320 kbps. An
MP3 cover image can be embedded in the file.

Files are checked before opening and before deciding whether another download
is needed. Old history entries are checked at startup. Invalid or changed files
are not kept as verified successes. Removing history does not delete media.
Moved or deleted files produce an opening error.

Playlist previews contain at most 2,000 entries, excluding duplicate and
unavailable entries. Live stream recording depends on the stream's duration.

## Updates

yt-dlp's nightly channel is checked daily; FFmpeg and Deno are checked weekly.
The manual check checks all three immediately. Tool downloads are verified with
SHA-256 from release metadata or checksum files before activation. Archives are
extracted into temporary directories and executables are validated. Active
downloads retain their tool versions. Old versions are removed when the app is idle.

Application updates use `tugcantopaloglu/youtube-downloader` by default. Settings
accepts another public `owner/repository` or GitHub repository URL. No GitHub
token is embedded. Automatic checks run at startup and every six hours. Updates
download in the background and can install on normal shutdown. Restart and
install is available only when downloads, verification and tool updates are idle.
Disabling automatic updates also disables installing an already-downloaded update
on shutdown. Manual check, download and install controls remain available.

Checksum mismatches, incorrect Windows executables, older versions and
prereleases are rejected. Application updates work in the NSIS-installed app and
are disabled in development. Update failures do not block available tools.

See [yt-dlp's dependency documentation](https://github.com/yt-dlp/yt-dlp#dependencies)
for its runtime requirements.

## Development and validation

Use Node.js 24 and npm on Windows:

```powershell
npm ci
npm run check
npm test
npm run build:ui
npm start
```

`Baslat.cmd` also starts the app and installs missing dependencies first.
Use `npm run dev` for live interface changes.

Behavior tests cover download cleanup, existing-file preservation, retry limits,
restart recovery and state backup restoration. They use temporary directories
and mocked network responses, without downloading videos or installing updates.
CI runs syntax checks, behavior tests, the interface build and Windows unpacked
packaging on pushes and pull requests.

```powershell
npm run pack
npm run dist
```

`pack` creates `release/win-unpacked/DownTube.exe`. `dist` creates an NSIS installer
in `release/` without publishing it. Use the installed version to test app updates.
`npm audit --omit=dev` checks shipped dependencies. The full audit also includes
packaging tools. Existing development-only findings in electron-builder's proxy
and logging dependencies require a compatible upstream update. Test packaging
and updates before applying the suggested builder downgrade.

## Publishing a release

The Windows Release workflow runs for `v*` tags or an explicit manual dispatch.
It builds and uploads the installer using its GitHub-provided token. Version tags
must match `package.json`.

```powershell
npm version patch
git push origin main --follow-tags
```

Local publication with `npm run release` requires `GH_TOKEN`. Keep it out of
source files. Update-compatible releases need `DownTube-Setup-<version>.exe`,
its `.exe.blockmap` and `latest.yml` together. The workflow produces these assets.
Change `repository` and `build.publish` in `package.json` for another publisher.
The repository selected in Settings changes the installed app's update source.

Installers are currently unsigned. Configure Electron Builder's `CSC_LINK` and
`CSC_KEY_PASSWORD` secrets for signing. Windows SmartScreen can warn about
unsigned installers.

## Local data

Settings, queue and history live in `%APPDATA%/akis-downloader/state.json`.
The previous valid state stays in `state.json.bak`. Tools are in `tools`,
thumbnails in `thumbnails` and partial files in `download-work`. Verified media
goes to the selected folder.

The installation identity and data folder are retained across updates. New
installations default to `Downloads/DownTube`; existing folder choices remain.

The application is MIT licensed. See [LICENSE](LICENSE) and
[THIRD_PARTY.md](THIRD_PARTY.md) for application and third-party terms.
