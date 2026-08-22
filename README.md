# Karaoke Propio

[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Based on](https://img.shields.io/badge/based%20on-Karaoke%20Eternal-blue.svg)](https://github.com/bhj/KaraokeEternal)
[![Docker](https://img.shields.io/badge/docker-compose-blue.svg)](docker-compose.yml)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Docker-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)]()

> **Built on [Karaoke Eternal](https://github.com/bhj/KaraokeEternal)** — © RadRoot LLC, ISC License.
> Karaoke Propio is an independent project that vendors and extends it; it is **not** an official
> Karaoke Eternal release and is not endorsed by its authors.
>
> **Construido sobre [Karaoke Eternal](https://github.com/bhj/KaraokeEternal)** — © RadRoot LLC, licencia ISC.
> Karaoke Propio es un proyecto independiente que lo incorpora y extiende; **no** es una versión oficial
> de Karaoke Eternal ni cuenta con el respaldo de sus autores.

**Author / Autor:** A Tu Manera Digital — Fernando Gallarday ([@fgallarday](https://github.com/fgallarday))

**AI Assistance / Asistencia de IA:** Developed with the support of GPT 5.6 Sol, Claude Opus 5, Claude Opus 4.8, and Claude Sonnet 5.

**Version / Versión:** 1.2.0

---

## English

A self-hosted karaoke system for home events. It keeps everything Karaoke Eternal
does well — library, queue, player, phone remote — and adds what a real party needs.

### What Karaoke Propio adds

| Feature | Description |
|---|---|
| **Song acquisition** | Search YouTube or UltraStar/USDB from inside the app and download straight into the library, with a preview before committing. |
| **Playlist import** | Paste a link to a public YouTube playlist and see at a glance which of its songs are already in the library. The rest are fetched one at a time, the usual way. |
| **Bulk import** (admin) | Download every karaoke track in a playlist that isn't here yet, one at a time and nothing queued. Artist and title are read against the library, and against MusicBrainz when the library has nothing to say — which side of the dash is the artist gets looked up rather than assumed. Every song is held under a flag until an admin has checked it, and a flagged library can have its names re-read at any time without downloading anything again. |
| **Per-request pitch** | Each singer picks their own key when queueing. Transposition starts immediately in the background, so there is no wait at showtime. |
| **Personal pitch memory** | The pitch each singer sings a song best in, remembered per person — the same song is -4 for one voice and +2 for another. Shown on the library row, and saved songs become a repertoire that queues in one tap. |
| **Pitch assistant** | When a song finishes, its singer is asked on their own phone how the pitch felt — too high, just right, a little low — and their saved pitch is corrected accordingly. No semitones to understand, and nobody else sees the question. |
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

### Media content and copyright

This repository does not include, distribute, host, or provide copyrighted songs, recordings, videos, lyrics, CD+G files, or karaoke tracks. Karaoke Propio is software only.

The project promotes respect for copyright and lawful use of media. It does not promote, facilitate, or authorize piracy. Users are solely responsible for obtaining, using, and managing media content for which they have the necessary rights, licences, permissions, or other lawful basis, and for complying with applicable copyright laws, platform terms, and local regulations.

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/ATuManera/karaoke-propio.git karaoke
   cd karaoke
   ```

2. **Set your environment**

   ```bash
   cp .env.example .env
   ```

   Adjust `PUID`/`PGID`, `TZ` and, for public access, your domain. Every setting
   is documented in [`.env.example`](.env.example).

3. **Start it**

   ```bash
   docker compose up -d --build
   ```

   The four images build on first run, which takes a few minutes.

4. **Open `http://<host>:8080`** and create the first account — it becomes the admin.

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

### Contributing

Bug reports and pull requests are welcome.

1. Fork the repository and branch from `main`.
2. From `app/`, run `npm test`, `npm run lint` and `npm run typecheck` before
   pushing. New behaviour needs tests; they live beside the `shared/` and
   `server/` code, as there is no browser test setup.
3. Open a pull request saying what changed and why.

Two conventions worth knowing:

- **Commit messages explain the reasoning**, not only the change. Work done with
  AI assistance carries an `Assisted by AI: <model>` trailer.
- **Fixes to Karaoke Eternal itself** — the vendored code under `app/` — are better
  sent upstream to [bhj/KaraokeEternal](https://github.com/bhj/KaraokeEternal), so
  everyone gets them and not only this fork.

The reasoning behind each feature, and the constraints found while building it,
are in [`docs/FEATURES.md`](docs/FEATURES.md).

### Licence

Apache License 2.0 — see [`LICENSE`](LICENSE). Third-party components keep their own
licences; see [`NOTICE`](NOTICE).

### Support the project

If Karaoke Propio made a party better, a ⭐ on the repository helps other people
find it.

---

## Español

Sistema de karaoke autoalojado para eventos en casa. Conserva todo lo que Karaoke Eternal
hace bien — biblioteca, cola, reproductor, control desde el celular — y agrega lo que una
fiesta real necesita.

### Lo que agrega Karaoke Propio

| Función | Descripción |
|---|---|
| **Adquisición de canciones** | Buscar en YouTube o UltraStar/USDB desde la app y descargar directo a la biblioteca, con vista previa antes de decidir. |
| **Importar una playlist** | Pegar el link de una playlist pública de YouTube y ver de un vistazo cuáles de sus canciones ya están en la biblioteca. Las que faltan se consiguen de a una, como siempre. |
| **Descarga masiva** (admin) | Descargar todas las pistas de karaoke de una playlist que aún no están, de a una y sin encolar nada. El artista y el título se leen contra la biblioteca, y contra MusicBrainz cuando la biblioteca no tiene nada que decir — de qué lado del guion está el artista se consulta en vez de suponerse. Cada canción queda marcada hasta que un administrador la revise, y las marcadas se pueden volver a leer en cualquier momento sin descargar nada de nuevo. |
| **Tono por solicitud** | Cada cantante elige su tonalidad al encolar. La transposición empieza de inmediato en segundo plano, sin espera al momento de cantar. |
| **Tono personal** | El tono en que cada cantante canta mejor una canción, recordado por persona — la misma canción es -4 para una voz y +2 para otra. Se ve en la fila de la biblioteca, y las canciones guardadas forman un repertorio que se encola con un toque. |
| **Asistente de tono** | Al terminar una canción, se le pregunta a quien la cantó, en su propio celular, cómo le quedó el tono — muy alta, perfecta, un poco baja — y su tono personal se corrige solo. Sin necesidad de entender semitonos, y sin que nadie más vea la pregunta. |
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

### Contenido multimedia y derechos de autor

Este repositorio no incluye, distribuye, aloja ni proporciona canciones, grabaciones, videos, letras, archivos CD+G ni pistas de karaoke protegidas por derechos de autor. Karaoke Propio es únicamente software.

El proyecto promueve el respeto de los derechos de autor y el uso legal de contenido multimedia. No promueve, facilita ni autoriza la piratería. Los usuarios son exclusivamente responsables de obtener, usar y administrar contenido multimedia para el cual cuenten con los derechos, licencias, permisos u otra base legal necesaria, así como de cumplir con las leyes de derecho de autor aplicables, términos de plataformas y normativa local.

### Instalación

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/ATuManera/karaoke-propio.git karaoke
   cd karaoke
   ```

2. **Configurar el entorno**

   ```bash
   cp .env.example .env
   ```

   Ajustar `PUID`/`PGID`, `TZ` y, para acceso público, el dominio. Cada variable
   está documentada en [`.env.example`](.env.example).

3. **Levantar la aplicación**

   ```bash
   docker compose up -d --build
   ```

   Las cuatro imágenes se construyen la primera vez, lo que toma unos minutos.

4. **Abrir `http://<host>:8080`** y crear la primera cuenta — queda como administradora.

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

### Contribuciones

Los reportes de errores y los pull requests son bienvenidos.

1. Hacer un fork del repositorio y crear una rama a partir de `main`.
2. Desde `app/`, correr `npm test`, `npm run lint` y `npm run typecheck` antes de
   publicar. Todo comportamiento nuevo necesita tests; van junto al código de
   `shared/` y `server/`, ya que no hay entorno de pruebas de navegador.
3. Abrir un pull request que diga qué cambia y por qué.

Dos convenciones que conviene conocer:

- **Los mensajes de commit explican el porqué**, no solo el qué. El trabajo hecho
  con asistencia de IA lleva la línea `Assisted by AI: <modelo>`.
- **Las correcciones a Karaoke Eternal en sí** — el código incorporado en `app/` —
  conviene enviarlas río arriba a [bhj/KaraokeEternal](https://github.com/bhj/KaraokeEternal),
  para que las aproveche todo el mundo y no solo este fork.

El razonamiento detrás de cada función, y las restricciones encontradas al
construirla, están en [`docs/FEATURES.md`](docs/FEATURES.md).

### Licencia

Apache License 2.0 — ver [`LICENSE`](LICENSE). Los componentes de terceros conservan sus
propias licencias; ver [`NOTICE`](NOTICE).

### Apoyar el proyecto

Si Karaoke Propio sirvió para mejorar una fiesta, una ⭐ en el repositorio
ayuda a que otras personas lo encuentren.

---

### Transparency / Transparencia

Parts of this project were developed with AI assistance. The models credited above assisted
with design, implementation, debugging and documentation. Authorship, and responsibility for
every change, rests with the human author, who reviewed, tested and deployed all of it.

Partes de este proyecto se desarrollaron con asistencia de IA. Los modelos acreditados arriba
asistieron en diseño, implementación, depuración y documentación. La autoría, y la
responsabilidad sobre cada cambio, corresponden al autor humano, que revisó, probó y desplegó
todo el trabajo.
