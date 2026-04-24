# ALACarte

Self-hosted Apple Music downloader with a polished web UI.

<div align="center">
  <img src="./assets/hero-album.png" alt="ALACarte Album Detail View" width="100%" />
</div>

## What it is

ALACarte is a browser-based tool that downloads lossless audio from Apple Music, converts it to FLAC, and organizes it into a clean library structure you can point any media server at.

- **Search & Discover:** Full access to the Apple Music catalog (albums, artists, songs).
- **Lossless & Hi-Res:** Download ALAC streams and auto-convert to FLAC with embedded artwork and metadata.
- **Lyrics Support:** Fetch embedded lyrics and sidecar `.lrc` files (requires `media-user-token`).
- **Smart Queuing:** Queue individual tracks, whole albums, or bulk-select entire artist discographies (filtered by LPs/EPs/Singles).
- **Library Awareness:** Duplicate prevention visually flags what is already in your library so you don't re-download.
- **Explicit / clean filtering:** Apple lists explicit and clean masters as separate albums. Pick your preference in Settings (or show both) to keep search results tidy.

Output lands in `/music/<Artist>/<Album>/01. Track.flac` (or `/music/<Artist>/Singles/` for individual songs).

---

## Beautiful and functional. Not just on the desktop.

<table style="border: none;">
  <tr>
    <td width="50%" align="center">
      <img src="./assets/mobile-showcase.png" alt="Mobile UI Showcase" />
      <br />
      <b>Fully responsive design</b><br />
      Search, queue, and manage your library effortlessly from your phone.
    </td>
    <td width="50%" align="center">
      <img src="./assets/status-dashboard.png" alt="Status Dashboard" />
      <br />
      <b>Complete system visibility</b><br />
      Watch your server work in real-time with an SSE-backed console, live job tracking, and granular health metrics.
    </td>
  </tr>
</table>

---

## Disclaimer
**This tool is for personal archival use only.** Downloading music you do not have a valid subscription/license for violates Apple's Terms of Service. You are responsible for ensuring your use complies with applicable terms and laws in your jurisdiction.

---

## Requirements

- Linux host (x86_64 or arm64) — the decryption wrapper is binary-only
- Docker + Docker Compose
- An **Apple Music paid subscription**

## Quick start

1. `git clone` this repo and `cd` into it
2. Copy `.env.example` to `.env` and set `MUSIC_PATH` to your music library folder
3. Run `docker compose up -d --build`
4. Open `http://<your-host>:7373`
5. Go to Settings → enter your Apple ID email, password, and preferred storefront

## First login flow

ALACarte needs to authenticate with Apple to obtain decryption tokens. This happens once, then the session persists across container restarts.

1. Enter your credentials in Settings and click Save.
2. If Apple requires 2FA, you'll see a prompt asking for the code sent to your Apple devices.
3. Enter the code within ~2 minutes.
4. When you see "Ready", you're good to search and download.

## How downloads behave

- Jobs run **one at a time** — queuing many items won't speed things up, it just lines them up.
- Download speed is throttled by Apple and varies by time of day.
- After a download completes, each track is converted from ALAC to FLAC and moved into your library (although you can disable this in the settings).
- The queue survives page refreshes but not container restarts.
- If a job fails (network hiccup, decryption glitch), you can re-queue it manually.

## Notes and limits

**IP rate-limiting and proxies** Apple appears to rate-limit by IP if you query huge amounts of data at once. In my experience, this isn't a permanent ban, I got soft-blocked for about a day after downloading ~1500 songs. If you plan to archive massive collections, consider:
- Spreading large jobs across multiple days
- Running behind a VPN or proxy
- Using a container with separate networking

**Queue size** I wouldn't recommend queueing more than 10 albums at a time. The UI will let you queue more, but since the jobs process sequentially they will just sit there until the earlier jobs complete, and it might cause issues with the decryption wrapper.

**Storage** - Lossless albums are ~300–600 MB each.
- The staging area uses temporary space under `/music/.amdl-tmp/` while working.

**Docker socket access** The web container mounts `/var/run/docker.sock` so it can spawn the wrapper container for first-time Apple ID login and 2FA. That effectively grants the web container root on the host. Only expose the UI on trusted networks, and don't host this on the open internet without a reverse proxy + auth in front of it.

**Sharing a network with Jellyfin/Plex/etc.** By default ALACarte creates its own `alacarte-net` Docker network. If you'd rather attach to an existing network (e.g. the one your media server already uses), set `DOCKER_NETWORK=<name>` and `DOCKER_NETWORK_EXTERNAL=true` in `.env`.

**Local compose tweaks** If you need to change things the `.env` variables don't cover (extra volumes, additional environment, etc.), drop a `docker-compose.override.yml` next to the main compose file. Docker Compose auto-merges it and it's gitignored, so you can run `docker compose up` normally without polluting the committed config.

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| "Sign in required" health warning | Wrapper isn't authenticated | Go to Settings and complete the login flow |
| "Docker socket not available" | First-time login needs host access | For initial setup, run the container with `-v /var/run/docker.sock:/var/run/docker.sock` or see the login instructions in Settings |
| Downloads stuck at 0% | Apple token expired or wrapper down | Wait a moment; it will auto-retry. If still stuck, restart the stack |
| Tracks show "failed" | Temporary Apple/server hiccup | Re-queue the album; transient failures usually clear |
| FLAC files are truncated | MP4Box runtime issue | Rebuild the container image and redeploy |

## Architecture

ALACarte runs on a shared Docker network with three primary components:
- **web:** This repository. It wraps the downloader CLI as a child process and serves the React SPA on port `7373`.
- **amdp:** The underlying downloader binary, included at build time.
- **wrapper:** A FairPlay decryption daemon that handles the DRM removal.

## Credits

Built upon:
- [zhaarey/apple-music-downloader](https://github.com/zhaarey/apple-music-downloader)
- [WorldObservationLog/wrapper](https://github.com/WorldObservationLog/wrapper)

The UI design was heavily inspired by the beautiful [Abyss theme](https://github.com/AumGupta/abyss-jellyfin), which was then customized and expanded from the ground up for this project.

## License

MIT — see LICENSE

---

<p align="center">
  <sub><a href="https://www.buymeacoffee.com/sosjalapeno">Buy me a Claude subscription</a></sub>
</p>