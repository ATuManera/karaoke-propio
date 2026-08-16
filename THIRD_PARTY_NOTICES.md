# Third-Party Notices

Karaoke Propio utiliza o se integra con componentes desarrollados por terceros.

Cada componente conserva sus propios derechos de autor, marcas, avisos y
condiciones de licencia. La Apache License 2.0 de Karaoke Propio se aplica
únicamente al código original desarrollado específicamente para este proyecto
y no sustituye las licencias de las dependencias externas.

## Karaoke Eternal (base del proyecto)

- Proyecto: Karaoke Eternal
- Autor: RadRoot LLC / bhj y colaboradores
- Repositorio: https://github.com/bhj/KaraokeEternal
- Versión vendida: 2.0.2 (tag `v2.0.2`, commit `b209d4a90aee03420eed5c14d0552b56bd7f89c5`)
- Licencia: ISC

El código fuente de Karaoke Eternal 2.0.2 fue vendido (copiado) dentro de
este repositorio bajo `./app` y modificado para implementar Karaoke Propio
(pitch por solicitud de cola, adquisición desde YouTube, registro puntual de
medios, etc.). El texto de la licencia ISC original se conserva en
`app/LICENSE`. La licencia ISC permite copiar y modificar el software
conservando el aviso de copyright y la licencia, lo cual se cumple aquí.

## yt-dlp

- Proyecto: yt-dlp
- Repositorio: https://github.com/yt-dlp/yt-dlp
- Licencia: Unlicense (dominio público / sin restricciones)
- Uso en Karaoke Propio: instalado como herramienta externa (`pip install
  yt-dlp`) dentro del contenedor `acquisition-worker` e invocado como
  subproceso (`execFile`). No se incorpora ni redistribuye su código fuente
  dentro de este repositorio.

## FFmpeg / Rubber Band Library

- FFmpeg: https://ffmpeg.org — licencia LGPL/GPL según los componentes
  habilitados en el build de Debian bookworm utilizado.
- Rubber Band Library: https://breakfastquay.com/rubberband/ — GPL v2/v3
  (o licencia comercial de Breakfast Quay).
- Uso en Karaoke Propio: instalados como binarios de sistema
  (`apt-get install ffmpeg rubberband-cli`) dentro de los contenedores
  `pitch-worker` y `acquisition-worker`, e invocados como subprocesos. No se
  incorpora ni enlaza su código fuente dentro de este repositorio; se
  distribuyen como binarios de terceros dentro de sus propias imágenes
  Docker, conforme a sus licencias.

## PiKaraoke (ya no es la base del proyecto)

- Proyecto: PiKaraoke — https://github.com/vicwomg/pikaraoke
- Licencia: GPL v3

PiKaraoke fue el prototipo inicial de Karaoke Propio (consumido como imagen
Docker externa, sin código fuente incorporado) y fue estudiado como
referencia de comportamiento durante el diseño de la adquisición de YouTube
(patrón de búsqueda `query + " karaoke"`, ~10 resultados, preferencia por
H264). Karaoke Propio ahora usa Karaoke Eternal como base; **no se copió
código fuente de PiKaraoke** en ningún módulo de este repositorio — los
módulos de adquisición (`server/Acquisition/`) son una reimplementación
propia sobre yt-dlp.

## UltraScrap CLI (referencia, no incorporado)

- Proyecto: UltraScrap CLI — commit `85e549cca96c578e02e235db9a13e609d82fcb95` (tag `v1.0.1`)
- Autor: Marcin Gąsienica-Makowski
- Licencia: MIT

`server/Acquisition/UsdbClient.ts` reimplementa (no copia) el comportamiento
documentado en UltraScrap CLI para consultar USDB: búsqueda
(`POST /?link=list` con `order`/`ud`/`interpret`/`title`/`limit`/`start`),
obtención de song.txt (`GET /?link=editsongs&id=`, extraído de un
`<textarea>`), enlace de YouTube publicado en comentarios
(`GET /?link=detail&id=`) y login (`POST /index.php?link=login`). Se
estudió el código fuente de UltraScrap (permitido por su licencia MIT) para
confirmar los nombres de campo y endpoints reales — verificado en vivo
contra `usdb.animux.de` el 13 de agosto de 2026 — pero el módulo es
reimplementación propia, no una copia. Si en el futuro se reutiliza código
sustancial de UltraScrap, debe conservarse el aviso MIT correspondiente.

## CDGSharp (integrado — MIT)

- Proyecto: CDGSharp — https://github.com/eibens/CDGSharp
- Autor: Johannes Egger
- Licencia: MIT

El código fuente de la librería CDGSharp (parser/serializador/generador de
CD+G) fue vendorizado sin modificar en `cdg-worker/CDGSharp/` (aviso de
licencia conservado en `cdg-worker/CDGSharp/LICENSE`), envuelto en un
servicio HTTP propio (`cdg-worker/CDGSharp.Worker/`, código nuevo, no de
CDGSharp) que reutiliza exactamente el mismo pipeline validado del CLI
original (`LrcFile.parseFile |> LrcToKaraoke.getKaraokeCommands |>
KaraokeGenerator.generate |> Serializer.serializePackets`). La conversión de
UltraStar song.txt a `.lrc` (`server/Acquisition/UltraStarToLrc.ts`) es
código propio, reimplementado a partir del formato UltraStar documentado —
no reutiliza código de CDGSharp ni de UltraScrap. Verificado con datos
reales: el pipeline completo (song.txt real → .lrc → .cdg) fue probado
contra la referencia usada en la validación original de CDGSharp
(Soda Stereo – De música ligera, 150 notas silábicas, 29 frases, GAP 24010,
BPM 250) y verificado con `CDGSharp.CLI explain`/`render-images`, incluyendo
inspección visual de los fotogramas generados.

## Dependencias de Karaoke Eternal (npm)

`app/package.json` (heredado de Karaoke Eternal 2.0.2) declara sus propias
dependencias de npm (React, Redux, Koa, Socket.IO, sqlate, music-metadata,
cdgraphics, etc.), cada una bajo su propia licencia (mayormente MIT/ISC).
Estas no se enumeran individualmente aquí; sus licencias no cambiaron al
vendorizar el código y permanecen las declaradas por cada paquete en
`node_modules/*/package.json` al instalar.

## Marcas

PiKaraoke, Karaoke Eternal, YouTube, Docker, FFmpeg, JBL, Fire TV y otras
denominaciones de terceros pertenecen a sus respectivos titulares. Su mención
tiene únicamente fines descriptivos e interoperables y no implica
patrocinio, afiliación ni respaldo.

## Contenido multimedia

Este repositorio no distribuye canciones, videos, pistas de audio ni letras.

Los archivos multimedia utilizados por una instalación de Karaoke Propio son
responsabilidad exclusiva del operador de dicha instalación, quien debe contar
con los derechos o autorizaciones necesarios para su uso. La función de
adquisición desde YouTube descarga contenido bajo petición explícita del
operador de la sala; el operador es responsable de contar con los derechos
necesarios para dicho uso.

## MusicBrainz (datos, no código)

- Proyecto: MusicBrainz — https://musicbrainz.org
- Datos bajo CC0 (datos principales) / CC BY-NC-SA 3.0 (datos suplementarios).
  Ver https://metabrainz.org/datasets/licenses

Karaoke Propio consulta la API pública de MusicBrainz para derivar las
categorías de cada canción (género, década, voz e idioma). No se incorpora
código de MusicBrainz; solo se consultan sus datos en tiempo de ejecución.

El cliente respeta las condiciones de uso de la API: identifica la aplicación
mediante `User-Agent` y limita las consultas a aproximadamente una por segundo
(ver `app/server/Categories/MusicBrainzClient.ts`).

## Nota sobre componentes GPL (FFmpeg y Rubber Band)

FFmpeg y Rubber Band Library son GPL y se instalan **dentro de los contenedores**
mediante el gestor de paquetes de la distribución; se invocan como procesos
independientes por línea de comandos, sin enlazado con el código de este
proyecto.

Este repositorio distribuye únicamente `Dockerfile`s y no imágenes ya
construidas, por lo que no distribuye binarios GPL. Quien publique imágenes
construidas a partir de este repositorio asume las obligaciones que
correspondan a esos componentes.
