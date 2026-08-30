# Third-Party Notices / Avisos de terceros

Karaoke Propio uses, integrates with, or was implemented with reference to components developed by third parties.

Karaoke Propio utiliza, se integra con, o fue implementado tomando como referencia componentes desarrollados por terceros.

Each third-party component retains its own copyright, trademarks, notices, and license terms. The Apache License 2.0 for Karaoke Propio applies only to original code developed specifically for this project and does not replace, override, or relicense any external dependency.

Cada componente de tercero conserva sus propios derechos de autor, marcas, avisos y condiciones de licencia. La Apache License 2.0 de Karaoke Propio se aplica únicamente al código original desarrollado específicamente para este proyecto y no sustituye, modifica ni relicencia las dependencias externas.

---

## 1. Karaoke Eternal — project base / base del proyecto

- Project / Proyecto: Karaoke Eternal
- Author / Autor: RadRoot LLC / bhj and contributors / RadRoot LLC / bhj y colaboradores
- Repository / Repositorio: <https://github.com/bhj/KaraokeEternal>
- Vendored version / Versión vendorizada: 2.0.2, tag `v2.0.2`, commit `b209d4a90aee03420eed5c14d0552b56bd7f89c5`
- License / Licencia: ISC

English:

The source code of Karaoke Eternal 2.0.2 was vendored into this repository under `./app` and modified to implement Karaoke Propio, including per-request queue pitch processing, YouTube acquisition, targeted media registration, and related functionality. The original ISC license text is preserved in `app/LICENSE`. The ISC license permits copying and modifying the software provided that the copyright notice and license text are retained, which this repository does.

Español:

El código fuente de Karaoke Eternal 2.0.2 fue vendorizado dentro de este repositorio bajo `./app` y modificado para implementar Karaoke Propio, incluyendo procesamiento de pitch por solicitud de cola, adquisición desde YouTube, registro puntual de medios y funcionalidades relacionadas. El texto de la licencia ISC original se conserva en `app/LICENSE`. La licencia ISC permite copiar y modificar el software siempre que se conserve el aviso de copyright y el texto de la licencia, lo cual se cumple en este repositorio.

---

## 2. yt-dlp

- Project / Proyecto: yt-dlp
- Repository / Repositorio: <https://github.com/yt-dlp/yt-dlp>
- License / Licencia: Unlicense, public-domain-equivalent / Unlicense, equivalente a dominio público o sin restricciones

English:

yt-dlp is installed as an external tool using `pip install yt-dlp` inside the `acquisition-worker` container and invoked as a subprocess through `execFile`. Its source code is not incorporated into or redistributed as part of this repository.

Español:

yt-dlp se instala como herramienta externa mediante `pip install yt-dlp` dentro del contenedor `acquisition-worker` y se invoca como subproceso mediante `execFile`. Su código fuente no se incorpora ni se redistribuye como parte de este repositorio.

---

## 3. FFmpeg / Rubber Band Library

- FFmpeg: <https://ffmpeg.org> — LGPL/GPL depending on the components enabled in the Debian bookworm build used / LGPL/GPL según los componentes habilitados en el build de Debian bookworm utilizado
- Rubber Band Library: <https://breakfastquay.com/rubberband/> — GPL v2/v3, or commercial license from Breakfast Quay / GPL v2/v3, o licencia comercial de Breakfast Quay

English:

FFmpeg and Rubber Band Library are installed as system binaries using `apt-get install ffmpeg rubberband-cli` inside the `pitch-worker` and `acquisition-worker` containers. They are invoked as independent command-line subprocesses. Their source code is not incorporated into this repository, and Karaoke Propio does not link against those libraries directly. When binaries are distributed inside built Docker images, they remain third-party binaries governed by their own license terms.

Español:

FFmpeg y Rubber Band Library se instalan como binarios de sistema mediante `apt-get install ffmpeg rubberband-cli` dentro de los contenedores `pitch-worker` y `acquisition-worker`. Se invocan como subprocesos independientes de línea de comandos. Su código fuente no se incorpora dentro de este repositorio, y Karaoke Propio no enlaza directamente contra esas bibliotecas. Cuando se distribuyen binarios dentro de imágenes Docker construidas, dichos binarios siguen siendo componentes de terceros sujetos a sus propias licencias.

---

## 4. PiKaraoke — prototype reference, no longer the project base / referencia de prototipo, ya no es la base del proyecto

- Project / Proyecto: PiKaraoke
- Repository / Repositorio: <https://github.com/vicwomg/pikaraoke>
- License / Licencia: GPL v3

English:

PiKaraoke was used as the initial prototype for Karaoke Propio through an external Docker image, without incorporating PiKaraoke source code into this repository. It was studied as a behavioral reference during the design of the YouTube acquisition flow, including the pattern `query + " karaoke"`, approximate result count behavior, and preference for H.264-compatible media.

Karaoke Propio now uses Karaoke Eternal as its code base. No PiKaraoke source code was copied into any module of this repository. The acquisition modules under `server/Acquisition/` are an original reimplementation built around yt-dlp.

Español:

PiKaraoke fue utilizado como prototipo inicial de Karaoke Propio mediante una imagen Docker externa, sin incorporar código fuente de PiKaraoke dentro de este repositorio. Fue estudiado como referencia de comportamiento durante el diseño del flujo de adquisición desde YouTube, incluyendo el patrón `query + " karaoke"`, el comportamiento aproximado de cantidad de resultados y la preferencia por medios compatibles con H.264.

Karaoke Propio ahora usa Karaoke Eternal como base de código. No se copió código fuente de PiKaraoke en ningún módulo de este repositorio. Los módulos de adquisición bajo `server/Acquisition/` son una reimplementación propia construida sobre yt-dlp.

---

## 5. UltraScrap CLI — reference only, not incorporated / solo referencia, no incorporado

- Project / Proyecto: UltraScrap CLI
- Commit: `85e549cca96c578e02e235db9a13e609d82fcb95`, tag `v1.0.1`
- Author / Autor: Marcin Gąsienica-Makowski
- License / Licencia: MIT

English:

`server/Acquisition/UsdbClient.ts` reimplements, without copying, the behavior documented and observed in UltraScrap CLI for querying USDB: search through `POST /?link=list` with `order`, `ud`, `interpret`, `title`, `limit`, and `start`; song.txt retrieval through `GET /?link=editsongs&id=` extracted from a `<textarea>`; YouTube link retrieval from comments through `GET /?link=detail&id=`; and login through `POST /index.php?link=login`.

UltraScrap source code was studied, as permitted by its MIT license, to confirm actual field names and endpoints. The behavior was also verified live against `usdb.animux.de` on August 13, 2026. The module in this repository is an original reimplementation, not a copy. If substantial UltraScrap code is reused in the future, the corresponding MIT notice must be retained.

Español:

`server/Acquisition/UsdbClient.ts` reimplementa, sin copiar, el comportamiento documentado y observado en UltraScrap CLI para consultar USDB: búsqueda mediante `POST /?link=list` con `order`, `ud`, `interpret`, `title`, `limit` y `start`; obtención de song.txt mediante `GET /?link=editsongs&id=` extraído desde un `<textarea>`; obtención de enlaces de YouTube publicados en comentarios mediante `GET /?link=detail&id=`; y login mediante `POST /index.php?link=login`.

El código fuente de UltraScrap fue estudiado, conforme lo permite su licencia MIT, para confirmar los nombres reales de campos y endpoints. El comportamiento también fue verificado en vivo contra `usdb.animux.de` el 13 de agosto de 2026. El módulo en este repositorio es una reimplementación propia, no una copia. Si en el futuro se reutiliza código sustancial de UltraScrap, deberá conservarse el aviso MIT correspondiente.

---

## 6. CDGSharp — integrated under MIT / integrado bajo MIT

- Project / Proyecto: CDGSharp
- Repository / Repositorio: <https://github.com/eibens/CDGSharp>
- Author / Autor: Johannes Egger
- License / Licencia: MIT

English:

The source code of the CDGSharp library, including the CD+G parser, serializer, and generator, was vendored without modification in `cdg-worker/CDGSharp/`. Its license notice is preserved in `cdg-worker/CDGSharp/LICENSE`.

Karaoke Propio wraps CDGSharp with its own HTTP service under `cdg-worker/CDGSharp.Worker/`. That wrapper is new project code and is not part of CDGSharp. It reuses the same validated processing pipeline from the original CLI:

```text
LrcFile.parseFile
|> LrcToKaraoke.getKaraokeCommands
|> KaraokeGenerator.generate
|> Serializer.serializePackets
```

The UltraStar song.txt to `.lrc` conversion implemented in `server/Acquisition/UltraStarToLrc.ts` is original project code based on the documented UltraStar format. It does not reuse code from CDGSharp or UltraScrap.

The full pipeline, from real song.txt to `.lrc` to `.cdg`, was tested with the same reference used during the original CDGSharp validation: Soda Stereo — De música ligera, 150 syllabic notes, 29 phrases, GAP 24010, BPM 250. The result was verified with `CDGSharp.CLI explain` and `render-images`, including visual inspection of generated frames.

Español:

El código fuente de la librería CDGSharp, incluyendo el parser, serializador y generador de CD+G, fue vendorizado sin modificaciones en `cdg-worker/CDGSharp/`. Su aviso de licencia se conserva en `cdg-worker/CDGSharp/LICENSE`.

Karaoke Propio envuelve CDGSharp con un servicio HTTP propio bajo `cdg-worker/CDGSharp.Worker/`. Ese wrapper es código nuevo del proyecto y no forma parte de CDGSharp. Reutiliza el mismo pipeline validado del CLI original:

```text
LrcFile.parseFile
|> LrcToKaraoke.getKaraokeCommands
|> KaraokeGenerator.generate
|> Serializer.serializePackets
```

La conversión de UltraStar song.txt a `.lrc` implementada en `server/Acquisition/UltraStarToLrc.ts` es código propio del proyecto basado en el formato UltraStar documentado. No reutiliza código de CDGSharp ni de UltraScrap.

El pipeline completo, desde song.txt real a `.lrc` y luego a `.cdg`, fue probado con la misma referencia usada durante la validación original de CDGSharp: Soda Stereo — De música ligera, 150 notas silábicas, 29 frases, GAP 24010, BPM 250. El resultado fue verificado con `CDGSharp.CLI explain` y `render-images`, incluyendo inspección visual de los fotogramas generados.

---

## 7. Karaoke Eternal npm dependencies / dependencias npm de Karaoke Eternal

English:

`app/package.json`, inherited from Karaoke Eternal 2.0.2, declares its own npm dependencies, including React, Redux, Koa, Socket.IO, sqlate, music-metadata, cdgraphics, and others. Each dependency remains governed by its own license, mostly MIT or ISC. These dependencies are not listed individually in this notice. Their licenses did not change when Karaoke Eternal was vendored, and they remain the licenses declared by each package in `node_modules/*/package.json` when installed.

Español:

`app/package.json`, heredado de Karaoke Eternal 2.0.2, declara sus propias dependencias npm, incluyendo React, Redux, Koa, Socket.IO, sqlate, music-metadata, cdgraphics y otras. Cada dependencia permanece sujeta a su propia licencia, mayormente MIT o ISC. Estas dependencias no se enumeran individualmente en este aviso. Sus licencias no cambiaron al vendorizar Karaoke Eternal y siguen siendo las declaradas por cada paquete en `node_modules/*/package.json` al instalar.

---

## 8. MusicBrainz — data, not code / datos, no código

- Project / Proyecto: MusicBrainz
- Website / Sitio web: <https://musicbrainz.org>
- Dataset licenses / Licencias de datos: <https://metabrainz.org/datasets/licenses>

English:

Karaoke Propio queries the public MusicBrainz API to derive song categories such as genre, decade, voice, and language. No MusicBrainz code is incorporated into this repository. Karaoke Propio only queries MusicBrainz data at runtime.

The client is designed to respect MusicBrainz API usage expectations by identifying the application through a `User-Agent` and limiting requests to approximately one request per second, as implemented in `app/server/Categories/MusicBrainzClient.ts`.

Español:

Karaoke Propio consulta la API pública de MusicBrainz para derivar categorías de canciones, tales como género, década, voz e idioma. No se incorpora código de MusicBrainz dentro de este repositorio. Karaoke Propio solo consulta datos de MusicBrainz en tiempo de ejecución.

El cliente está diseñado para respetar las condiciones esperadas de uso de la API de MusicBrainz, identificando la aplicación mediante un `User-Agent` y limitando las consultas a aproximadamente una solicitud por segundo, según lo implementado en `app/server/Categories/MusicBrainzClient.ts`.

---

## 9. Trademarks / Marcas

English:

PiKaraoke, Karaoke Eternal, YouTube, Docker, FFmpeg, JBL, Fire TV, MusicBrainz, and other third-party names are trademarks or names belonging to their respective owners. Their mention is solely descriptive and for interoperability, attribution, compatibility, or explanatory purposes. It does not imply sponsorship, affiliation, endorsement, or approval by those owners.

Español:

PiKaraoke, Karaoke Eternal, YouTube, Docker, FFmpeg, JBL, Fire TV, MusicBrainz y otras denominaciones de terceros son marcas o nombres pertenecientes a sus respectivos titulares. Su mención tiene únicamente fines descriptivos y de interoperabilidad, atribución, compatibilidad o explicación. No implica patrocinio, afiliación, respaldo ni aprobación por parte de dichos titulares.

---

## 10. Multimedia content / contenido multimedia

English:

This repository does not distribute songs, videos, audio tracks, lyrics, or other copyrighted karaoke media.

Any media files used by a Karaoke Propio installation are the sole responsibility of the operator of that installation. The operator must have the rights, licenses, permissions, or other legal authorization required for the intended use. The YouTube acquisition feature downloads content only upon explicit request by the room operator. The operator remains responsible for ensuring that such use is lawful and properly authorized.

Español:

Este repositorio no distribuye canciones, videos, pistas de audio, letras ni otros medios de karaoke protegidos por derechos de autor.

Los archivos multimedia utilizados por una instalación de Karaoke Propio son responsabilidad exclusiva del operador de dicha instalación. El operador debe contar con los derechos, licencias, permisos u otra autorización legal necesaria para el uso previsto. La función de adquisición desde YouTube descarga contenido únicamente bajo solicitud explícita del operador de la sala. El operador sigue siendo responsable de asegurar que dicho uso sea lícito y cuente con la autorización correspondiente.

---

## 11. Note on GPL components — FFmpeg and Rubber Band / nota sobre componentes GPL — FFmpeg y Rubber Band

English:

FFmpeg and Rubber Band Library include GPL-licensed components and are installed inside containers through the operating system package manager. They are invoked as independent command-line processes and are not linked with this project's code.

From version 2.9.0 this project also publishes prebuilt Docker images — to `ghcr.io/atumanera` and to Docker Hub under `atumanera` — and the `pitch-worker` and `acquisition-worker` images contain those binaries. Where to obtain their corresponding source:

- The binaries are the unmodified Debian bookworm packages `ffmpeg` and `rubberband-cli`, installed with `apt-get` and not rebuilt, patched or statically linked by this project. Debian publishes the corresponding source for every binary package it ships: `apt-get source ffmpeg` / `apt-get source rubberband` inside the same base image (`node:22-bookworm-slim`, with a `deb-src` line enabled for `bookworm` and `bookworm-updates`), or <https://deb.debian.org/debian/pool/main/f/ffmpeg/> and <https://deb.debian.org/debian/pool/main/r/rubberband/>.
- Upstream sources: <https://ffmpeg.org/download.html> and <https://breakfastquay.com/rubberband/>.

Each published image carries LICENSE, NOTICE and this file under `/licenses`. Anyone who builds and publishes their own images from this repository takes on the same obligations for the third-party GPL components those images contain.

Español:

FFmpeg y Rubber Band Library incluyen componentes bajo licencia GPL y se instalan dentro de los contenedores mediante el gestor de paquetes del sistema operativo. Se invocan como procesos independientes de línea de comandos y no se enlazan con el código de este proyecto.

Desde la versión 2.9.0 este proyecto también publica imágenes Docker preconstruidas —en `ghcr.io/atumanera` y en Docker Hub bajo `atumanera`— y las imágenes de `pitch-worker` y `acquisition-worker` contienen esos binarios. Dónde obtener su código fuente correspondiente:

- Los binarios son los paquetes de Debian bookworm `ffmpeg` y `rubberband-cli` sin modificar, instalados con `apt-get`: este proyecto no los recompila, ni los parcha, ni los enlaza estáticamente. Debian publica el código fuente correspondiente de cada paquete binario que distribuye: `apt-get source ffmpeg` / `apt-get source rubberband` dentro de la misma imagen base (`node:22-bookworm-slim`, habilitando una línea `deb-src` para `bookworm` y `bookworm-updates`), o bien <https://deb.debian.org/debian/pool/main/f/ffmpeg/> y <https://deb.debian.org/debian/pool/main/r/rubberband/>.
- Fuentes originales: <https://ffmpeg.org/download.html> y <https://breakfastquay.com/rubberband/>.

Cada imagen publicada lleva LICENSE, NOTICE y este archivo en `/licenses`. Quien construya y publique sus propias imágenes a partir de este repositorio asume las mismas obligaciones respecto de los componentes GPL de terceros que esas imágenes contengan.
