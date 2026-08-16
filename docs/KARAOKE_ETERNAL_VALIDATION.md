# Validación técnica de Karaoke Eternal

## Fecha

10 de agosto de 2026

## Actualización — 13 de agosto de 2026

Karaoke Eternal 2.0.2 fue vendorizado (código fuente copiado y modificado)
dentro de este repositorio en `app/`, y las capacidades de pitch y
adquisición descritas como "brechas" más abajo fueron implementadas y
probadas sobre esa base — no solo evaluadas. Resumen:

- **Pitch por solicitud de cola**: implementado (`server/Pitch/`), probado
  con transcodes reales vía FFmpeg/rubberband contra archivos de la
  biblioteca real, y probado end-to-end vía Docker Compose (ver
  `docker-compose.yml`, servicio `pitch-worker`).
- **Adquisición desde YouTube**: implementada (`server/Acquisition/`),
  probada end-to-end (búsqueda real, descarga real, publicación atómica,
  registro puntual, encolado preservando pitch) vía Docker Compose (servicio
  `acquisition-worker`).
- **`/api/media` ya no es estrictamente admin-only**: ahora acepta acceso de
  cualquier usuario autenticado de la room siempre que presente un
  `queueId` válido perteneciente a su room firmada (JWT) — ver
  `app/server/Media/router.ts`. El acceso admin-only original se conserva
  para el caso sin `queueId` (herramientas de biblioteca).
- **UltraStar→CDG**: implementado (`cdg-worker/` vendoriza CDGSharp, MIT;
  `server/Acquisition/UltraStarToLrc.ts` es un conversor propio) y probado
  con datos reales — pipeline song.txt→.lrc→.cdg verificado contra la misma
  canción de referencia que validó CDGSharp originalmente, con inspección
  visual de los fotogramas generados.
- **USDB**: cliente reimplementado y corregido tras verificación en vivo
  (13-ago-2026) contra `usdb.animux.de` — el markup real usa
  `show_detail(id)`/`list_tr1|2`, no lo que se había asumido inicialmente, y
  **toda** llamada (incluida la búsqueda) requiere una sesión autenticada,
  confirmado por la respuesta real "You are not logged in". `login()` está
  implementado pero no probado con credenciales reales (no se leyó
  `credentials.json` de UltraScrap ni se obtuvieron credenciales sin
  configuración explícita del operador). Ver
  `docs/SESSION_ARCHITECTURE.md` sección 0 para el detalle.

El resto de este documento es el hallazgo original de la PoC del 10 de
agosto y se conserva sin modificar como registro histórico.

## Estado

Prueba de concepto completada satisfactoriamente para evaluar Karaoke Eternal como motor base de la arquitectura multi-sesión de Karaoke Propio.

La prueba se realizó en paralelo con la instalación existente de PiKaraoke, sin modificarla ni sustituirla.

## Objetivo

Determinar si Karaoke Eternal puede resolver de forma nativa los principales requisitos de sesiones simultáneas de Karaoke Propio y reducir la necesidad de implementar una capa de coordinación basada en múltiples instancias independientes de PiKaraoke.

Los aspectos prioritarios evaluados fueron:

- múltiples salas simultáneas;
- biblioteca compartida;
- colas independientes;
- participantes por sala;
- reproductores independientes;
- QR específico por sala;
- reproducción simultánea;
- aislamiento de controles;
- persistencia;
- cola justa entre cantantes;
- utilización de recursos;
- compatibilidad con archivos MP4 existentes;
- existencia o ausencia de cambio de tonalidad;
- existencia o ausencia de adquisición de canciones desde Internet.

## Entorno probado

Servidor:

```text
Ubuntu 22.04.5 LTS
Docker Engine
Docker Compose
```

Karaoke Eternal:

```text
Versión mostrada por la aplicación: 2.0.2
Imagen Docker: radrootllc/karaoke-eternal
Puerto publicado en la prueba: 8080
```

Identificador exacto de la imagen probada:

```text
sha256:c9be89bc70c925f0df64e0153279fcb87d559c17864571d62cbdc630c9468a3d
```

Fecha de creación de la imagen:

```text
2026-02-15T01:37:45.671483043Z
```

Persistencia de contenedor:

```text
/config
/mnt/karaoke
```

Base de datos creada por Karaoke Eternal:

```text
/config/database.sqlite3
```

PiKaraoke permaneció funcionando simultáneamente durante toda la prueba:

```text
vicwomg/pikaraoke:1.21.0
estado healthy
```

## Arranque y persistencia básica

El contenedor de Karaoke Eternal inició correctamente.

Durante el primer arranque:

- creó la base SQLite;
- ejecutó las migraciones internas;
- generó su secreto JWT;
- inició el servidor HTTP en el puerto interno 8080.

La aplicación permitió crear correctamente la cuenta inicial de administrador.

Los archivos SQLite quedaron persistidos correctamente:

```text
database.sqlite3
database.sqlite3-shm
database.sqlite3-wal
```

## Biblioteca multimedia

Se configuró como carpeta multimedia:

```text
/mnt/karaoke
```

El escáner detectó correctamente archivos MP4 provenientes de una biblioteca existente.

Durante la prueba se utilizaron varias canciones MP4 de diferentes artistas para validar indexación, cola y reproducción.

La biblioteca fue indexada por artista y canción.

La duración de los archivos fue reconocida correctamente.

## Salas

Se crearon dos salas de prueba:

```text
Sala A
Sala B
```

Ambas coexistieron dentro de una sola instancia de Karaoke Eternal.

### Biblioteca compartida

Las dos salas accedieron a la misma biblioteca multimedia.

Una canción incorporada al servidor quedó disponible para ambas salas sin duplicar el archivo ni ejecutar una instancia adicional del motor.

### Colas independientes

Las colas permanecieron aisladas por sala.

Agregar una canción en una sala no la agregó a la cola de la otra.

### Participantes

Los invitados pudieron acceder sin crear una cuenta registrada.

El flujo probado fue:

```text
QR
→ selección de acceso como Guest
→ ingreso de nombre visible
→ Join
→ biblioteca de la sala
```

Los logs confirmaron asociaciones independientes de participantes con salas distintas.

### QR específico por sala

El reproductor mostró un QR asociado a la sala activa.

Se observó una URL del tipo:

```text
/library?roomid=<id>
```

Esto permite dirigir al invitado directamente hacia la sala correspondiente.

## Reproductores simultáneos

Cada sala pudo mantener su propio reproductor activo.

Se probaron simultáneamente:

```text
Sala A -> Player A
Sala B -> Player B
```

Ambos reproductores permanecieron activos al mismo tiempo.

También se reprodujeron canciones simultáneamente en ambos players.

### Aislamiento de controles

Se verificó que:

- pausar Sala A no pausó Sala B;
- ejecutar Skip/Next en Sala A no modificó Sala B.

Por tanto, el estado de reproducción está aislado por sala.

## Reproducción MP4

Los archivos MP4 de la biblioteca existente pudieron reproducirse con:

- video correcto;
- audio correcto;
- duración reconocida;
- streaming desde el servidor.

Durante una prueba apareció temporalmente:

```text
MEDIA_ELEMENT_ERROR: Format error (code 4)
```

El servidor continuaba entregando correctamente el archivo como:

```text
video/mp4
```

Después de cerrar y volver a iniciar el player de esa sala, el mismo archivo se reprodujo correctamente.

Por tanto, el incidente se consideró relacionado con el estado del player o navegador y no con una incompatibilidad permanente del archivo.

## Cola justa entre cantantes

Karaoke Eternal aplica una política de ordenamiento que intercala cantantes.

Caso probado:

```text
Host A tenía dos canciones pendientes.
Guest A agregó una canción distinta.
```

La cola fue reorganizada de manera intercalada:

```text
Host A  -> Canción 1
Guest A -> Canción 2
Host A  -> Canción 3
```

Esto evita que un participante monopolice consecutivamente la cola.

También se observó que una misma canción no puede agregarse simultáneamente más de una vez a la misma cola.

## Persistencia después de reinicio

Con ambas salas operativas se ejecutó una detención normal del contenedor y posteriormente se volvió a iniciar.

Después del reinicio persistieron:

- cuenta de administrador;
- salas;
- biblioteca;
- canciones indexadas;
- colas independientes.

No se observó corrupción de datos.

## Reproducción durante caída breve del servidor

Al detener el contenedor mientras los players estaban reproduciendo, los navegadores continuaron reproduciendo temporalmente el contenido ya almacenado en buffer.

Esto no constituye persistencia del servidor, pero demuestra que una interrupción breve del backend no necesariamente interrumpe de manera inmediata el media ya recibido por el navegador.

## Utilización de recursos

Con dos salas y dos reproductores reproduciendo simultáneamente se observó aproximadamente:

```text
CPU: 0.15 %
RAM del contenedor: 36.91 MiB
PIDs: 11
```

El consumo observado fue muy bajo.

Esto favorece el uso de una sola instancia de Karaoke Eternal con múltiples Rooms frente a una arquitectura basada en varias instancias completas del motor.

## Cambio de tonalidad

No se encontró control nativo de pitch, key o cambio de tonalidad en Karaoke Eternal 2.0.2.

La interfaz del player no ofrece esta capacidad.

Esto representa una brecha funcional respecto de PiKaraoke 1.21.0, donde el cambio de tonalidad ya fue validado satisfactoriamente.

Karaoke Propio deberá resolver esta función mediante desarrollo propio, extensión del player o integración de otro componente si Karaoke Eternal es seleccionado como motor base.

## Búsqueda y adquisición de canciones

La búsqueda de Karaoke Eternal opera sobre la biblioteca local.

Se realizó una búsqueda de una canción no existente en la biblioteca y el resultado fue:

```text
0 artists
0 songs
```

No apareció ninguna opción para buscar o descargar contenido desde Internet.

Esto representa otra brecha funcional frente a PiKaraoke, que ya permite búsqueda y adquisición de canciones mediante su integración existente.

Karaoke Propio deberá separar conceptualmente:

```text
reproducción y sesiones
```

de:

```text
adquisición e incorporación de contenido
```

si se adopta Karaoke Eternal.

## Resultado de la prueba

Se consideran validadas satisfactoriamente las siguientes capacidades:

- una sola instancia de servidor;
- múltiples Rooms;
- biblioteca compartida;
- colas independientes;
- participantes por sala;
- invitados sin cuenta;
- QR específico por sala;
- players independientes;
- reproducción simultánea;
- aislamiento de Pause;
- aislamiento de Skip/Next;
- reproducción MP4;
- persistencia de Rooms;
- persistencia de biblioteca;
- persistencia de colas;
- política de cola justa;
- bajo consumo de recursos.

Se consideran brechas confirmadas:

- ausencia de cambio de tonalidad;
- ausencia de búsqueda y adquisición online de canciones.

## Implicación arquitectónica

La prueba demuestra que ya no es necesario asumir una arquitectura como:

```text
Session Manager
      |
      +---- PiKaraoke Room 1
      +---- PiKaraoke Room 2
      +---- PiKaraoke Room 3
```

para conseguir sesiones simultáneas.

Karaoke Eternal permite una arquitectura sustancialmente más simple:

```text
Karaoke Propio
      |
      v
Karaoke Eternal
      |
      +---- Room 1
      +---- Room 2
      +---- Room 3
      +---- Room N
```

con una única biblioteca compartida.

## Decisión recomendada

Karaoke Eternal 2.0.2 pasa a ser el candidato preferente como motor base para la arquitectura multi-sesión de Karaoke Propio.

PiKaraoke debe conservarse temporalmente como referencia funcional y prototipo validado, especialmente para:

- cambio de tonalidad;
- adquisición de canciones;
- comparación de comportamiento.

La decisión definitiva de sustitución debe acompañarse de una arquitectura explícita para resolver las dos brechas funcionales identificadas.

## Próximo paso

Actualizar `SESSION_ARCHITECTURE.md` para sustituir el diseño basado en múltiples instancias PiKaraoke por una arquitectura basada en:

- una instancia de Karaoke Eternal;
- Rooms nativas;
- biblioteca compartida;
- capa propia de Karaoke Propio;
- servicio propio de adquisición de canciones;
- estrategia propia de cambio de tonalidad.
