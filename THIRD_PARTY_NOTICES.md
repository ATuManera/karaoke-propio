# Third-Party Notices

Karaoke Propio utiliza o se integra con componentes desarrollados por terceros.

Cada componente conserva sus propios derechos de autor, marcas, avisos y
condiciones de licencia. La Apache License 2.0 de Karaoke Propio se aplica
únicamente al código original desarrollado específicamente para este proyecto
y no sustituye las licencias de las dependencias externas.

## PiKaraoke

- Proyecto: PiKaraoke
- Autor principal: Vic Wong y colaboradores
- Repositorio: https://github.com/vicwomg/pikaraoke
- Imagen Docker utilizada en el prototipo: `vicwomg/pikaraoke:1.21.0`
- Función actual: motor externo de reproducción, biblioteca, búsqueda, cola,
  pantalla remota y cambio de tonalidad.

La versión inicial de Karaoke Propio consume PiKaraoke como una imagen Docker
externa. El código fuente de PiKaraoke no está incluido ni republicado dentro
de este repositorio.

Antes de copiar, modificar, incorporar o redistribuir código fuente de
PiKaraoke, deberá revisarse y respetarse la licencia aplicable a la versión
concreta utilizada. Este archivo no atribuye a PiKaraoke una licencia que no
haya sido verificada expresamente.

## Otras dependencias

La imagen Docker de PiKaraoke y las futuras capas propias de Karaoke Propio
pueden utilizar bibliotecas, herramientas o servicios de terceros, incluyendo,
entre otros:

- FFmpeg
- Rubber Band Library
- yt-dlp
- Flask
- Socket.IO
- Docker

Cada dependencia conserva su propia licencia. Cuando Karaoke Propio incorpore
código o distribuya binarios que incluyan estos componentes, deberán
identificarse las versiones utilizadas y conservarse los avisos exigidos por
sus respectivas licencias.

## Marcas

PiKaraoke, YouTube, Docker, FFmpeg, JBL, Fire TV y otras denominaciones de
terceros pertenecen a sus respectivos titulares. Su mención tiene únicamente
fines descriptivos e interoperables y no implica patrocinio, afiliación ni
respaldo.

## Contenido multimedia

Este repositorio no distribuye canciones, videos, pistas de audio ni letras.

Los archivos multimedia utilizados por una instalación de Karaoke Propio son
responsabilidad exclusiva del operador de dicha instalación, quien debe contar
con los derechos o autorizaciones necesarios para su uso.
