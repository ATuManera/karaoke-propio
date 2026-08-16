# Karaoke Propio

[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Based on](https://img.shields.io/badge/based%20on-Karaoke%20Eternal-blue.svg)](https://github.com/bhj/KaraokeEternal)
[![Docker](https://img.shields.io/badge/docker-compose-blue.svg)](docker-compose.yml)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Docker-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()

> **Built on [Karaoke Eternal](https://github.com/bhj/KaraokeEternal)** — © RadRoot LLC, ISC License.
> Karaoke Propio is an independent project that vendors and extends it; it is **not** an official
> Karaoke Eternal release and is not endorsed by its authors.
>
> **Construido sobre [Karaoke Eternal](https://github.com/bhj/KaraokeEternal)** — © RadRoot LLC, licencia ISC.
> Karaoke Propio es un proyecto independiente que lo incorpora y extiende; **no** es una versión oficial
> de Karaoke Eternal ni cuenta con el respaldo de sus autores.

**Author / Autor:** A Tu Manera Digital — Fernando Gallarday ([@fgallarday](https://github.com/fgallarday))
**AI Assistance / Asistencia de IA:** Developed with the support of GPT 5.6 Sol, Claude Opus 4.8, and Claude Sonnet 5.
**Version / Versión:** 1.0.0

---

## English

A self-hosted karaoke system for home events. It keeps everything Karaoke Eternal
does well — library, queue, player, phone remote — and adds what a real party needs.

### What Karaoke Propio adds

| Feature | Description |
|---|---|
| **Song acquisition** | Search YouTube or UltraStar/USDB from inside the app and download straight into the library, with a preview before committing. |
| **Per-request pitch** | Each singer picks their own key when queueing. Transposition starts immediately in the background, so there is no wait at showtime. |
| **Version picker** | When a song has several recordings, the singer chooses which one. |
| **Categories** | Genre, decade, voice (male/female/duet/group) and language, looked up automatically from MusicBrainz and editable by hand. |
| **Popularity sorting** | Order the library by how watched each source recording is. |
| **Event photo album** | Guests upload photos from their phone; everyone in the room can view and download them. |
| **Invite by QR code** | A random room code replaces the sequential room id, so an invite cannot be guessed. Guests scan and sing — no password to type. |
| **Public access** | Optional HTTPS exposure through an existing nginx-proxy + Let's Encrypt, configured with a single variable. |
| **Notes & key** | Melody note by note for UltraStar songs, plus an estimated musical key for any track. |

### Requirements

- Docker and Docker Compose
- ~4 GB RAM (pitch shifting is CPU-bound)
- Optional: a domain and an existing `nginx-proxy` + `acme-companion` for public access

### Installation

```bash
git clone <this-repo> karaoke && cd karaoke
cp .env.example .env      # adjust PUID/PGID, TZ, optional domain
docker compose up -d --build
```

The app answers on `http://<host>:8080`. Every setting is documented in
[`.env.example`](.env.example).

### Architecture

Four services, so heavy or unusual dependencies stay isolated:

| Service | Role |
|---|---|
| `karaoke-eternal` | Web app and API (Node, Alpine) |
| `pitch-worker` | Pitch shifting and key detection (ffmpeg + rubberband) |
| `acquisition-worker` | YouTube search and download (yt-dlp + ffmpeg) |
| `cdg-worker` | CD+G generation from UltraStar files (.NET, CDGSharp) |

### Credits

This project would not exist without the work of others:

- **[Karaoke Eternal](https://github.com/bhj/KaraokeEternal)** (© RadRoot LLC, ISC) — the base
  of the application, vendored under `app/` with its licence preserved.
- **[CDGSharp](https://github.com/johannesegger/CDGSharp)** (© Johannes Egger, MIT) — CD+G
  rendering, integrated under `cdg-worker/`.
- **[PiKaraoke](https://github.com/vicwomg/pikaraoke)** (GPLv3) — the original inspiration and a
  reference for how to approach YouTube previews. **No PiKaraoke source code was copied**; the
  equivalent behaviour here is an independent implementation over yt-dlp's documented CLI.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**, **[FFmpeg](https://ffmpeg.org)**,
  **[Rubber Band](https://breakfastquay.com/rubberband/)**, **[MusicBrainz](https://musicbrainz.org)**.

Full details, licences and obligations: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

### Licence

Apache License 2.0 — see [`LICENSE`](LICENSE). Third-party components keep their own
licences; see [`NOTICE`](NOTICE).

---

## Español

Sistema de karaoke autoalojado para eventos en casa. Conserva todo lo que Karaoke Eternal
hace bien — biblioteca, cola, reproductor, control desde el celular — y agrega lo que una
fiesta real necesita.

### Lo que agrega Karaoke Propio

| Función | Descripción |
|---|---|
| **Adquisición de canciones** | Buscar en YouTube o UltraStar/USDB desde la app y descargar directo a la biblioteca, con vista previa antes de decidir. |
| **Tono por solicitud** | Cada cantante elige su tonalidad al encolar. La transposición empieza de inmediato en segundo plano, sin espera al momento de cantar. |
| **Selector de versión** | Cuando una canción tiene varias grabaciones, el cantante elige cuál. |
| **Categorías** | Género, década, voz (hombre/mujer/dúo/grupo) e idioma, obtenidos automáticamente de MusicBrainz y editables a mano. |
| **Orden por popularidad** | Ordenar la biblioteca según qué tan vista es cada grabación de origen. |
| **Álbum de fotos** | Los invitados suben fotos desde el celular; todos en la sala pueden verlas y descargarlas. |
| **Invitación por QR** | Un código aleatorio reemplaza al id de sala secuencial, así una invitación no se puede adivinar. El invitado escanea y canta, sin escribir contraseña. |
| **Acceso público** | Exposición HTTPS opcional mediante un nginx-proxy + Let's Encrypt existente, con una sola variable. |
| **Notas y tonalidad** | Melodía nota por nota en canciones UltraStar, y tonalidad estimada para cualquier pista. |

### Requisitos

- Docker y Docker Compose
- ~4 GB de RAM (el cambio de tono usa CPU intensivamente)
- Opcional: un dominio y un `nginx-proxy` + `acme-companion` ya instalados, para acceso público

### Instalación

```bash
git clone <este-repo> karaoke && cd karaoke
cp .env.example .env      # ajustar PUID/PGID, TZ, dominio opcional
docker compose up -d --build
```

La app responde en `http://<host>:8080`. Cada variable está documentada en
[`.env.example`](.env.example).

### Arquitectura

Cuatro servicios, para que las dependencias pesadas o inusuales queden aisladas:

| Servicio | Rol |
|---|---|
| `karaoke-eternal` | Aplicación web y API (Node, Alpine) |
| `pitch-worker` | Cambio de tono y detección de tonalidad (ffmpeg + rubberband) |
| `acquisition-worker` | Búsqueda y descarga de YouTube (yt-dlp + ffmpeg) |
| `cdg-worker` | Generación de CD+G desde archivos UltraStar (.NET, CDGSharp) |

### Créditos

Este proyecto no existiría sin el trabajo de otros:

- **[Karaoke Eternal](https://github.com/bhj/KaraokeEternal)** (© RadRoot LLC, ISC) — la base de
  la aplicación, incorporada en `app/` conservando su licencia.
- **[CDGSharp](https://github.com/johannesegger/CDGSharp)** (© Johannes Egger, MIT) — renderizado
  CD+G, integrado en `cdg-worker/`.
- **[PiKaraoke](https://github.com/vicwomg/pikaraoke)** (GPLv3) — la inspiración original y
  referencia sobre cómo abordar la vista previa de YouTube. **No se copió código fuente de
  PiKaraoke**; el comportamiento equivalente es una implementación propia sobre la CLI documentada
  de yt-dlp.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**, **[FFmpeg](https://ffmpeg.org)**,
  **[Rubber Band](https://breakfastquay.com/rubberband/)**, **[MusicBrainz](https://musicbrainz.org)**.

Detalle completo, licencias y obligaciones: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

### Licencia

Apache License 2.0 — ver [`LICENSE`](LICENSE). Los componentes de terceros conservan sus
propias licencias; ver [`NOTICE`](NOTICE).

---

### Transparency / Transparencia

Parts of this project were developed with AI assistance. The models credited above as
co-authors participated in design, implementation, debugging and documentation. All changes
were reviewed, tested and deployed by the human author.

Partes de este proyecto se desarrollaron con asistencia de IA. Los modelos acreditados arriba
como co-autores participaron en diseño, implementación, depuración y documentación. Todos los
cambios fueron revisados, probados y desplegados por el autor humano.
