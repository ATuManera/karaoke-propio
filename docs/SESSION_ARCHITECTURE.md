# Arquitectura de sesiones de Karaoke Propio

## Estado del documento

- Rama de trabajo: `feature/session-architecture`
- Estado: arquitectura revisada después de la validación técnica de Karaoke Eternal
- Fecha: 10 de agosto de 2026
- Proyecto: `ATuManera/karaoke-propio`

## 0. Actualización de estado — implementación del 13 de agosto de 2026

**Este documento describe la visión completa (Control Plane propio + Engine
Adapter + base de datos separada, sección 9). Lo que se implementó el 13 de
agosto de 2026 es deliberadamente más acotado**: siguiendo
`prompt_de_implementacion.md`, se extendió Karaoke Eternal directamente (sin
Control Plane separado, sin base de datos propia adicional, sin Engine
Adapter) para entregar dos capacidades obligatorias del MVP familiar:
adquisición de canciones desde la web y cambio de tono por solicitud
individual de cola. Esta decisión es intencional, no un incumplimiento de
esta arquitectura: el Control Plane (sección 9.1), el Engine Adapter
(9.2) y la base de datos propia en PostgreSQL (9.6) siguen **pendientes**
como evolución futura si el producto crece más allá de un único host
familiar por instalación.

Mapeo de lo implementado contra este documento:

| Sección de este documento | Estado tras la sesión del 13-ago-2026 |
| --- | --- |
| 9.3 Karaoke Eternal (motor) | Vendorizado y modificado en `app/` (fork de KE 2.0.2) |
| 9.4 Servicio de adquisición | **Implementado y probado end-to-end**: `server/Acquisition/` + `acquisition-worker` (YouTube, real) + `cdg-worker` (UltraStar→CDG, real — ver abajo). USDB está correctamente reimplementado y verificado *estructuralmente* contra el markup real de `usdb.animux.de`, pero bloqueado en vivo por requerir una sesión autenticada que este entorno no tenía (ver `docs/KARAOKE_ETERNAL_VALIDATION.md`) |
| 9.5 Servicio de pitch | **Implementado y probado**: `server/Pitch/PitchManager.ts` + contenedor `pitch-worker` (FFmpeg/rubberband) |
| 9.1 Karaoke Propio Control Plane | Pendiente — no implementado en esta sesión |
| 9.2 Engine Adapter | Pendiente — no implementado en esta sesión |
| 9.6 Base de datos propia (PostgreSQL) | Pendiente — Karaoke Propio sigue usando únicamente el SQLite de Karaoke Eternal (extendido con las migraciones 006) |
| 10. Modelo de datos (HostUser, KaraokeSession, etc.) | Pendiente — se usa el modelo nativo de KE (User/Room) directamente |

**UltraStar→CDG (sección 36 del prompt): implementado y probado con datos
reales el 13-ago-2026**, después de una primera pasada que lo había dejado
pendiente. CDGSharp (MIT) fue vendorizado en `cdg-worker/CDGSharp/` y
envuelto en un servicio HTTP (`cdg-worker/CDGSharp.Worker/`), reutilizando
exactamente el pipeline validado del CLI original. Se escribió un conversor
propio UltraStar song.txt → `.lrc` (`server/Acquisition/UltraStarToLrc.ts`,
14 tests contra la referencia real) y se verificó el pipeline completo
(song.txt real → .lrc → .cdg) contra la misma canción de referencia que
validó CDGSharp originalmente (Soda Stereo – De música ligera: 150 notas,
29 frases, GAP 24010, BPM 250), incluyendo decodificación con
`CDGSharp.CLI explain` e inspección visual de fotogramas renderizados
("Ella durmio" / "Al calor de las brasas" se leen correctamente). Lo que
sigue bloqueado es específicamente la obtención EN VIVO de song.txt desde
USDB (requiere sesión autenticada — ver 9.4 arriba), no la generación de
CDG en sí.

Detalle completo de arquitectura, archivos, pruebas y limitaciones de la
implementación de pitch/adquisición: ver el resumen entregado al final de la
sesión de implementación (disponible en el historial de la conversación que
generó este cambio) y los tests en `app/server/**/*.test.ts`.

## 1. Objetivo

Definir la arquitectura funcional y técnica de la capa propia de sesiones de Karaoke Propio.

La solución debe permitir que varios anfitriones ejecuten reuniones de karaoke simultáneas sobre una misma instalación, manteniendo separadas las colas, participantes, reproductores y controles de cada sesión.

Después de la prueba de concepto realizada el 10 de agosto de 2026, Karaoke Eternal 2.0.2 pasa a ser el candidato preferente como motor base para las funciones multi-room.

PiKaraoke 1.21.0 se conserva temporalmente como referencia funcional y prototipo validado, especialmente para las capacidades de:

- cambio de tonalidad;
- búsqueda y adquisición de canciones;
- comparación de comportamiento.

La arquitectura deja de asumir que cada sesión requiere una instancia independiente de PiKaraoke.

## 2. Decisión arquitectónica principal

### 2.1 Diseño anterior

La propuesta inicial asumía:

```text
Karaoke Propio Session Manager
        |
        +---- Motor PiKaraoke 1
        +---- Motor PiKaraoke 2
        +---- Motor PiKaraoke 3
```

Cada sesión debía reservar una instancia independiente del motor.

Ese enfoque requería:

- múltiples contenedores;
- coordinación de lifecycle;
- asignación y liberación de motores;
- aislamiento de almacenamiento;
- coordinación de biblioteca compartida;
- healthchecks por instancia;
- mayor complejidad operativa.

### 2.2 Diseño revisado

La prueba técnica demostró que una sola instancia de Karaoke Eternal puede mantener múltiples Rooms con:

- biblioteca compartida;
- colas independientes;
- invitados independientes;
- players independientes;
- reproducción simultánea;
- controles aislados;
- persistencia.

La arquitectura revisada es:

```text
Usuarios y dispositivos
        |
        v
Reverse proxy HTTPS
        |
        v
Karaoke Propio Web / Control Plane
        |
        +---------------------------+
        |                           |
        v                           v
Base de datos propia        Karaoke Eternal
de Karaoke Propio                  |
                                    +---- Room 1
                                    +---- Room 2
                                    +---- Room 3
                                    +---- Room N
                                           |
                                           v
                                 Biblioteca compartida
```

Karaoke Eternal se considera el motor de ejecución de salas, colas y player.

Karaoke Propio se mantiene como la capa de producto, identidad, autorización, lifecycle, política, integración y experiencia de usuario.

## 3. Principios de diseño

La arquitectura debe priorizar:

- simplicidad operativa;
- baja utilización de recursos;
- aislamiento lógico por sesión;
- una única biblioteca multimedia compartida;
- mínimo acoplamiento con el motor externo;
- posibilidad de sustituir el motor futuro sin rediseñar toda la plataforma;
- separación entre reproducción, adquisición de contenido y procesamiento de audio;
- seguridad por defecto;
- persistencia de datos críticos;
- recuperación después de reinicio;
- experiencia sencilla para anfitriones e invitados.

Karaoke Propio no debe depender de detalles internos de Karaoke Eternal más de lo estrictamente necesario.

## 4. Requisitos confirmados

### 4.1 Anfitriones

- Los anfitriones deben autenticarse con una cuenta.
- Un anfitrión puede crear, administrar, pausar y cerrar sesiones.
- Un anfitrión puede consultar su historial de sesiones.
- La plataforma puede imponer un límite de sesiones simultáneas por anfitrión.
- El anfitrión puede administrar cola, reproducción y participantes de sus sesiones.
- La autorización de anfitrión pertenece a Karaoke Propio, no al código público de una sesión.
- Debe quedar prevista la incorporación futura de coanfitriones.

### 4.2 Invitados

- Los invitados no necesitan cuenta, correo ni contraseña.
- Acceden mediante enlace o código QR.
- Al ingresar deben escribir un nombre visible.
- El nombre visible no debe utilizarse como identificador técnico.
- La plataforma debe asignar un identificador interno independiente.
- Dos participantes pueden usar el mismo nombre sin compartir identidad técnica.
- La identidad anónima debe conservarse durante la sesión en el navegador del invitado.
- Un invitado solo debe poder operar sobre la sesión a la que se incorporó.
- Debe existir la posibilidad de limitar canciones pendientes por invitado.

### 4.3 Sesiones

Cada sesión de Karaoke Propio representa conceptualmente una Room de Karaoke Eternal más el metadata y las políticas propias de Karaoke Propio.

Cada sesión debe disponer de:

- identificador interno;
- código público;
- anfitrión propietario;
- nombre visible;
- estado;
- Room asociada en Karaoke Eternal;
- participantes;
- cola;
- canción actual;
- estado de reproducción;
- player principal;
- configuración;
- historial de eventos;
- vencimiento.

Estados previstos:

- `created`
- `active`
- `paused`
- `closing`
- `closed`
- `expired`

La primera versión debe admitir como mínimo tres sesiones simultáneas.

La arquitectura no debe imponer artificialmente un máximo de tres si Karaoke Eternal y la infraestructura permiten más.

### 4.4 Código público

Cada sesión recibe un código público único.

Primera propuesta:

- longitud: seis caracteres;
- excluir caracteres ambiguos:
  - `0`
  - `O`
  - `1`
  - `I`
  - `L`

Ejemplo:

```text
Z3PNX7
```

El código identifica una sesión, pero no concede privilegios administrativos.

### 4.5 Duración

Duración predeterminada inicial:

```text
12 horas
```

La política debe ser configurable.

Una sesión puede cerrarse manualmente antes de su vencimiento.

### 4.6 Reproductor

Cada sesión tendrá una pantalla reproductora principal.

Dispositivos previstos:

- Fire TV Stick;
- Smart TV con navegador;
- computadora;
- tablet;
- navegador moderno equivalente.

El player debe vincularse únicamente a una Room/sesión.

Debe mostrar como mínimo:

- video;
- letras cuando estén incorporadas;
- cantante actual;
- siguiente turno cuando sea viable;
- código QR;
- estado de espera.

La primera versión debe asumir un player principal por sesión.

### 4.7 Dominios

Dominio canónico previsto:

```text
https://karaoke.gallarday.com
```

Dominios alternativos previstos:

```text
https://karaoke.smarthome.pe
https://karaoke.casainteligente.pe
```

Los dominios alternativos deben redirigir al dominio canónico para evitar fragmentación de:

- cookies;
- sesiones;
- WebSockets;
- URLs públicas;
- tokens de vinculación.

## 5. Capacidades validadas de Karaoke Eternal

La prueba técnica documentada en `docs/KARAOKE_ETERNAL_VALIDATION.md` confirmó:

- una sola instancia de Karaoke Eternal;
- múltiples Rooms;
- biblioteca compartida;
- colas independientes;
- invitados sin cuenta;
- QR específico por Room;
- players simultáneos;
- reproducción simultánea;
- aislamiento de Pause;
- aislamiento de Skip/Next;
- reproducción MP4;
- persistencia de Rooms;
- persistencia de biblioteca;
- persistencia de colas;
- política de cola intercalada entre cantantes;
- bajo consumo de recursos.

Estas capacidades pasan a considerarse parte de la base técnica disponible y no deben reimplementarse innecesariamente en Karaoke Propio.

## 6. Brechas funcionales confirmadas

### 6.1 Cambio de tonalidad

> **Implementado y probado (13-ago-2026).** Estrategia elegida: FFmpeg +
> filtro `rubberband` en un servicio Docker separado (`pitch-worker`), pitch
> como propiedad de cada fila de `queue` (no de la Room), cache por
> `(mediaId, sourceFingerprint, pitch)`, concurrencia global máxima 2. Ver
> sección 0 de este documento y `docs/KARAOKE_ETERNAL_VALIDATION.md`.

Karaoke Eternal 2.0.2 no ofrece cambio nativo de pitch/key.

PiKaraoke 1.21.0 sí lo ofrece y fue validado previamente.

Karaoke Propio debe incorporar una estrategia propia para esta función.

Opciones a evaluar:

- procesamiento previo con FFmpeg;
- Rubber Band Library;
- procesamiento de audio en backend;
- procesamiento en navegador mediante Web Audio;
- extensión directa del player;
- generación de variantes temporales por semitono;
- integración selectiva de componentes de terceros compatibles.

La solución debe mantener:

- velocidad de reproducción;
- sincronización audio/video;
- latencia aceptable;
- uso razonable de CPU;
- aislamiento por sesión.

### 6.2 Adquisición de canciones

> **YouTube: implementado y probado (13-ago-2026).** Servicio Docker
> separado (`acquisition-worker`, yt-dlp+ffmpeg), orquestado por
> `server/Acquisition/AcquisitionManager.ts`: búsqueda → descarga a staging →
> publicación atómica → registro puntual (sin full scan) → cola,
> preservando room/user/pitch.
>
> **UltraStar→CDG: implementado y probado con datos reales (13-ago-2026).**
> CDGSharp (MIT) vendorizado en `cdg-worker/`, conversor propio
> song.txt→.lrc (`server/Acquisition/UltraStarToLrc.ts`), pipeline completo
> verificado contra la referencia validada originalmente (Soda Stereo – De
> música ligera) con inspección visual de los fotogramas CD+G resultantes.
>
> **USDB: cliente reimplementado y verificado estructuralmente contra el
> markup real, pero bloqueado en vivo.** `usdb.animux.de` requiere una
> sesión autenticada para TODO (búsqueda incluida, no solo song.txt como se
> asumía originalmente) — confirmado en vivo el 13-ago-2026 con la respuesta
> real "You are not logged in". `UsdbClient.login()` está implementado
> contra la forma de solicitud documentada por UltraScrap, activable vía
> `USDB_USERNAME`/`USDB_PASSWORD`, pero no se probó con credenciales reales
> (no debía leerse `credentials.json` de UltraScrap ni obtenerse credenciales
> sin que el operador las configure explícitamente). Ver sección 0 y
> `docs/KARAOKE_ETERNAL_VALIDATION.md`.

Karaoke Eternal busca únicamente en la biblioteca local.

No se observó un flujo nativo equivalente a la búsqueda/descarga online de PiKaraoke.

Karaoke Propio debe separar la adquisición de contenido del motor de reproducción.

Arquitectura conceptual:

```text
Fuentes de contenido
        |
        v
Servicio de adquisición
        |
        v
Validación / normalización
        |
        v
Biblioteca compartida
        |
        v
Karaoke Eternal
```

El servicio de adquisición podrá incorporar en el futuro:

- descarga desde fuentes compatibles;
- carga manual;
- importación de archivos;
- normalización de nombres;
- extracción de metadata;
- detección de duplicados;
- validación de codecs;
- generación de derivados.

La implementación debe respetar licencias, términos de servicio y derechos sobre el contenido.

## 7. Rutas públicas propuestas

### 7.1 Página inicial

```text
/
```

Funciones:

- acceso de anfitrión;
- ingreso manual de código;
- información básica del servicio.

### 7.2 Invitado

Ruta canónica de Karaoke Propio:

```text
/s/{codigo}
```

Ejemplo:

```text
/s/Z3PNX7
```

La capa propia resolverá el código y dirigirá al invitado a la Room correspondiente.

No se debe exponer `roomid` como contrato público estable si puede evitarse.

### 7.3 Ruta abreviada

Opcionalmente:

```text
/{codigo}
```

Debe redirigir internamente a:

```text
/s/{codigo}
```

### 7.4 Anfitrión

```text
/host/{codigo}
```

Requiere:

- autenticación;
- autorización sobre la sesión;
- validación de estado.

### 7.5 Reproductor

Ruta pública propia prevista:

```text
/player/{codigo}
```

La capa de Karaoke Propio resolverá la sesión y establecerá el vínculo con la Room correspondiente.

El detalle interno de Karaoke Eternal no debe convertirse en contrato público permanente.

### 7.6 Administración

```text
/admin
```

Reservado para administración de plataforma.

### 7.7 API

```text
/api/v1/
```

### 7.8 Tiempo real

Puede utilizarse:

```text
/socket.io/
```

o WebSocket equivalente.

La implementación final dependerá de la estrategia de integración seleccionada.

## 8. Arquitectura lógica

```text
                        +----------------------+
                        |   Host / Invitados   |
                        +----------+-----------+
                                   |
                                   v
                         Reverse Proxy HTTPS
                                   |
                                   v
                    +---------------------------+
                    | Karaoke Propio Control    |
                    | Plane / Web Application   |
                    +-------------+-------------+
                                  |
              +-------------------+-------------------+
              |                                       |
              v                                       v
      Base de datos propia                      Adapter / Engine API
              |                                       |
              |                                       v
              |                               Karaoke Eternal
              |                                       |
              |                     +-----------------+-----------------+
              |                     |                 |                 |
              |                     v                 v                 v
              |                   Room 1            Room 2            Room N
              |                     |                 |                 |
              +---------------------+-----------------+-----------------+
                                    |
                                    v
                           Biblioteca compartida
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
          Servicio de adquisición          Servicio de pitch
                futuro                          futuro
```

## 9. Componentes

### 9.1 Karaoke Propio Control Plane

Responsabilidades:

- autenticación de anfitriones;
- autorización;
- creación de sesiones;
- generación de códigos;
- expiración;
- lifecycle de sesiones;
- asignación y mapeo de Room;
- registro de invitados;
- generación de QR;
- player binding;
- políticas por sesión;
- historial;
- auditoría;
- límites;
- integración con servicios externos.

No debe duplicar innecesariamente:

- cola;
- player;
- biblioteca;
- round-robin;

si esas funciones se delegan de forma estable a Karaoke Eternal.

### 9.2 Engine Adapter

Debe existir una capa explícita de adaptación entre Karaoke Propio y Karaoke Eternal.

Objetivo:

evitar que el resto del sistema dependa directamente de endpoints, eventos o estructuras internas del motor.

Contrato conceptual:

```text
create_room()
close_room()
get_room()
list_rooms()
join_guest()
get_queue()
enqueue_song()
remove_queue_item()
pause()
resume()
skip()
get_player_state()
start_player()
```

No se asume que todos estos métodos existan como API pública actual.

La fase de integración debe determinar:

- API disponible;
- WebSocket;
- eventos;
- llamadas internas;
- adaptación mediante wrapper;
- necesidad de contribuciones upstream.

### 9.3 Karaoke Eternal

Responsabilidades delegadas inicialmente:

- Rooms;
- biblioteca;
- cola;
- política de turnos;
- player web;
- reproducción;
- persistencia interna del motor;
- asociación player-room;
- QR interno de prueba.

No debe asumir responsabilidades de plataforma como:

- códigos públicos de Karaoke Propio;
- políticas comerciales;
- autorización de anfitrión;
- expiración de sesiones;
- auditoría de plataforma.

### 9.4 Servicio de adquisición

Componente separado, futuro.

Responsabilidades previstas:

- recibir búsquedas o solicitudes;
- descargar/importar contenido permitido;
- validar formatos;
- limpiar nombres;
- detectar duplicados;
- mover archivos a la biblioteca;
- solicitar o esperar reindexación.

El motor no debe ser responsable de adquirir contenido.

### 9.5 Servicio de pitch

Componente separado o extensión del player.

Responsabilidades previstas:

- aplicar cambio de tonalidad;
- mantener tempo;
- preservar sincronización;
- exponer estado y parámetros por canción;
- evitar afectar otras Rooms.

Su diseño queda pendiente de PoC.

### 9.6 Base de datos propia

Recomendación inicial:

PostgreSQL.

Motivos:

- anfitriones;
- sesiones;
- invitados;
- códigos públicos;
- player bindings;
- eventos;
- auditoría;
- integridad;
- crecimiento;
- concurrencia.

La base SQLite interna de Karaoke Eternal pertenece al motor.

No debe convertirse en la base principal de datos de negocio de Karaoke Propio.

### 9.7 Estado en tiempo real

La aplicación propia puede necesitar:

- WebSocket;
- Socket.IO;
- Server-Sent Events;

para reflejar cambios de estado.

El estado esencial debe persistir en PostgreSQL.

Estado efímero puede mantenerse inicialmente en memoria si existe una única instancia del Control Plane.

Redis no es obligatorio para la primera versión.

Debe quedar previsto si se requiere:

- múltiples réplicas;
- coordinación distribuida;
- pub/sub;
- locks;
- cache compartido.

### 9.8 Reverse proxy

El tráfico público debe ingresar únicamente mediante el reverse proxy HTTPS.

Los componentes internos no deben exponerse directamente a Internet salvo necesidad justificada.

Karaoke Eternal debe quedar detrás de la capa de proxy o adapter cuando la arquitectura propia esté implementada.

## 10. Modelo de datos inicial

### 10.1 HostUser

Campos mínimos:

- `id`
- `email`
- `display_name`
- `password_hash`
- `status`
- `created_at`
- `updated_at`
- `last_login_at`

### 10.2 KaraokeSession

Campos mínimos:

- `id`
- `public_code`
- `host_user_id`
- `name`
- `status`
- `engine_room_id`
- `created_at`
- `activated_at`
- `expires_at`
- `closed_at`
- `settings_json`

`engine_room_id` identifica la Room del motor asociada a la sesión.

No debe exponerse necesariamente al cliente final.

### 10.3 GuestParticipant

Campos mínimos:

- `id`
- `session_id`
- `guest_token_hash`
- `display_name`
- `status`
- `joined_at`
- `last_seen_at`
- `removed_at`

### 10.4 PlayerBinding

Campos mínimos:

- `id`
- `session_id`
- `player_token_hash`
- `device_name`
- `status`
- `bound_at`
- `last_seen_at`
- `revoked_at`

### 10.5 SessionEvent

Campos mínimos:

- `id`
- `session_id`
- `actor_type`
- `actor_id`
- `event_type`
- `event_payload`
- `created_at`

### 10.6 MediaAsset

Componente propio futuro.

Campos sugeridos:

- `id`
- `canonical_title`
- `artist`
- `source_type`
- `source_reference`
- `local_path_ref`
- `media_type`
- `duration`
- `checksum`
- `status`
- `created_at`
- `updated_at`

No debe almacenar necesariamente una ruta física absoluta del host en el modelo público.

### 10.7 SongVariant

Para cambio de tonalidad futuro:

- `id`
- `media_asset_id`
- `semitones`
- `status`
- `cache_ref`
- `created_at`
- `expires_at`

Este modelo solo será necesario si se implementan derivados precalculados.

## 11. Mapeo Session ↔ Room

Karaoke Propio mantiene su propia entidad `KaraokeSession`.

Karaoke Eternal mantiene su propia entidad `Room`.

La relación conceptual es:

```text
KaraokeSession 1 ---- 1 Engine Room
```

La sesión puede existir en estado `created` antes de que la Room esté completamente preparada.

El adapter debe impedir:

- una Room asignada a dos sesiones activas;
- una sesión apuntando a una Room inexistente;
- reutilización accidental de una Room cerrada sin limpieza;
- pérdida silenciosa del vínculo.

Debe existir reconciliación después de reinicios.

## 12. Flujo de creación de sesión

1. El anfitrión inicia sesión.
2. Selecciona `Crear sesión`.
3. Karaoke Propio valida:
   - límite global;
   - límite por anfitrión;
   - políticas vigentes.
4. Genera un código público único.
5. Solicita la creación o preparación de una Room en Karaoke Eternal.
6. Persiste el identificador de la Room.
7. Define vencimiento.
8. La sesión pasa a `active`.
9. Muestra al anfitrión:
   - enlace de invitados;
   - QR;
   - control de player;
   - panel de sesión.

La creación de Room debe ser idempotente o recuperable.

## 13. Flujo de acceso de invitado

1. El invitado escanea el QR.
2. Accede a:

```text
/s/{codigo}
```

3. Karaoke Propio verifica que:
   - el código exista;
   - la sesión esté activa;
   - no esté vencida;
   - permita invitados.
4. Solicita un nombre visible.
5. Genera un token anónimo de alta entropía.
6. Almacena solo el hash del token en el servidor.
7. Conserva el token en cookie o storage seguro.
8. Registra al invitado en la sesión.
9. Resuelve la Room asociada.
10. El invitado puede:
    - buscar en biblioteca;
    - agregar canciones;
    - ver cola;
    - retirar solicitudes propias si la política lo permite;
    - seleccionar tonalidad cuando esa función exista.

La integración puede utilizar mecanismos nativos de Guest de Karaoke Eternal, pero Karaoke Propio debe mantener su propia identidad lógica.

## 14. Flujo de vinculación del reproductor

Propuesta de producto:

1. El player abre:

```text
/player
```

2. Karaoke Propio muestra un código temporal de vinculación.
3. El anfitrión introduce o aprueba ese código.
4. La plataforma vincula el dispositivo con una sesión.
5. El player recibe un token propio de dispositivo.
6. El token se conserva localmente.
7. Karaoke Propio resuelve la Room correspondiente.
8. El player inicia la vista del motor en esa Room.
9. El anfitrión puede revocar el vínculo.

Este flujo evita utilizar el QR público de invitados como mecanismo administrativo.

Mientras esta capa no exista, la funcionalidad nativa de Karaoke Eternal puede utilizarse únicamente como mecanismo de PoC.

## 15. Gestión de cola

Karaoke Eternal demostró una política de cola justa entre cantantes.

Comportamiento observado:

```text
Host A  -> Canción 1
Guest A -> Canción 2
Host A  -> Canción 3
```

Esto debe preservarse salvo que exista una razón funcional para sustituirlo.

También se observó que una misma canción no puede agregarse simultáneamente más de una vez a una misma cola.

La política de Karaoke Propio debe definir:

- máximo de canciones pendientes por invitado;
- posibilidad de eliminar canción propia;
- prioridad administrativa del anfitrión;
- tratamiento de duplicados;
- solicitudes especiales;
- canciones bloqueadas;
- comportamiento al abandonar la sesión.

## 16. Biblioteca compartida

La prueba demostró que múltiples Rooms pueden utilizar una única biblioteca.

Por tanto, se elimina la necesidad de mantener varias copias por sala.

Modelo:

```text
Biblioteca única
      |
      +---- Room 1
      +---- Room 2
      +---- Room 3
      +---- Room N
```

La biblioteca debe permanecer fuera de Git.

Debe considerarse:

- acceso concurrente;
- escaneo;
- importación;
- archivos temporales;
- validación de formatos;
- detección de duplicados;
- backups;
- permisos.

La escritura debe concentrarse preferentemente en el servicio de adquisición.

Karaoke Eternal debería consumir la biblioteca como repositorio operativo, evitando que múltiples componentes escriban sin coordinación.

## 17. Cambio de tonalidad

La selección de tonalidad debe ser un atributo de una solicitud de canción.

Modelo conceptual:

```text
QueueRequest
  song
  singer
  semitones
```

Rango inicial por definir.

PiKaraoke demostró técnicamente que cambios amplios de tonalidad son posibles, pero Karaoke Propio debe establecer un rango de producto razonable.

La arquitectura debe evitar reiniciar innecesariamente una canción en reproducción.

Preferencia:

- seleccionar tonalidad antes de encolar;
- preparar variante antes del turno;
- cachear si resulta eficiente.

## 18. Persistencia y recuperación

Karaoke Eternal demostró persistencia de:

- Rooms;
- biblioteca;
- colas.

Karaoke Propio debe persistir independientemente:

- sesión;
- código;
- anfitrión;
- invitados;
- player bindings;
- políticas;
- eventos.

Después de reinicio:

1. Control Plane carga sesiones `active`.
2. Consulta el estado del motor.
3. Reconcilia `engine_room_id`.
4. Marca inconsistencias.
5. Recupera bindings.
6. Notifica al anfitrión si una Room no puede recuperarse.

No debe crearse automáticamente una nueva Room sin evaluar si la anterior sigue existiendo.

## 19. Seguridad

### 19.1 Autenticación

- Argon2id preferido o bcrypt.
- Cookies `HttpOnly`.
- Cookies `Secure`.
- `SameSite=Lax` o política equivalente.
- protección CSRF;
- rate limiting;
- bloqueo progresivo ante intentos abusivos.

### 19.2 Invitados

- tokens aleatorios;
- no usar nombre como identidad;
- rate limiting por sesión, token e IP cuando corresponda;
- límites de cola;
- sanitización de nombre;
- capacidad de expulsión;
- revocación del token.

### 19.3 Códigos

- generación criptográficamente segura;
- unicidad;
- expiración;
- regeneración;
- no conceder privilegios administrativos.

### 19.4 Player binding

- tokens independientes;
- revocables;
- con alcance limitado a una sesión;
- no reutilizar credenciales de anfitrión;
- no incrustar secretos administrativos en QR público.

### 19.5 Contenedores

- imágenes fijadas por versión o digest cuando sea razonable;
- sin secretos en Git;
- volúmenes con permisos mínimos;
- healthchecks;
- backups;
- redes internas;
- exposición pública mínima.

### 19.6 Datos públicos

La documentación pública no debe incluir:

- IP internas reales;
- rutas privadas del host;
- credenciales;
- tokens;
- secretos;
- hostnames internos;
- correos personales innecesarios;
- datos que no sean requeridos para reproducibilidad.

### 19.7 Contenido multimedia

El repositorio no distribuye contenido multimedia.

Las canciones permanecen fuera de Git.

Cada operador es responsable de contar con derechos o autorizaciones suficientes para el contenido utilizado.

## 20. Observabilidad

La primera versión debe registrar como mínimo:

- creación de sesión;
- activación;
- cierre;
- invitado unido;
- invitado expulsado;
- canción agregada;
- canción eliminada;
- player vinculado;
- player revocado;
- errores del motor;
- fallos de reproducción;
- recuperación después de reinicio.

No deben registrarse secretos.

## 21. Backups

Deben respaldarse:

### Karaoke Propio

- PostgreSQL;
- configuración;
- claves necesarias para operación;
- metadata propia.

### Karaoke Eternal

- `/config`;
- base interna del motor.

### Biblioteca

Debe existir una estrategia separada para los archivos multimedia.

Los backups de medios pueden tener RPO y retención diferentes a los metadatos.

## 22. Integración con Karaoke Eternal

La siguiente etapa técnica debe identificar el contrato de integración real.

Debe documentarse:

- API HTTP disponible;
- endpoints internos;
- WebSocket;
- eventos;
- autenticación;
- estructura de Room;
- estructura de Queue;
- lifecycle;
- player binding;
- señales de error.

No debe implementarse automatización de UI si existe una interfaz programática estable.

Si la API pública es insuficiente, las alternativas en orden de preferencia son:

1. contribución upstream;
2. wrapper/adapter mantenido por Karaoke Propio;
3. fork mínimo y documentado;
4. automatización de UI solo como último recurso.

## 23. Dependencia del motor

El objetivo no es convertir Karaoke Propio en un fork irreconocible de Karaoke Eternal.

La arquitectura debe conservar este límite:

```text
Karaoke Propio
   |
   v
Engine Adapter
   |
   v
Karaoke Eternal
```

En el futuro debería ser posible incorporar otro motor mediante un adapter equivalente.

## 24. Recomendación tecnológica inicial

### Backend propio

Candidatos:

- Python 3.12;
- FastAPI;
- SQLAlchemy;
- Alembic;
- PostgreSQL.

La elección debe validarse frente a la integración con el motor.

### Frontend

Opciones:

- servidor + HTMX + Alpine.js;
- React;
- Vue.

Para una experiencia altamente interactiva, multiusuario y orientada a dispositivos móviles, React o Vue pueden resultar más adecuados a mediano plazo.

La primera implementación debe priorizar rapidez y mantenibilidad.

### Tiempo real

- WebSocket;
- Socket.IO;
- mecanismo equivalente.

### Infraestructura

- Docker;
- Docker Compose;
- reverse proxy HTTPS;
- healthchecks;
- persistencia externa.

## 25. Fases de implementación revisadas

### Fase 1 — Contrato con Karaoke Eternal

- documentar API y eventos;
- determinar cómo crear y cerrar Rooms;
- determinar cómo obtener cola y estado;
- determinar cómo controlar player;
- validar integración sin automatización de interfaz;
- definir `EngineAdapter`.

### Fase 2 — Control Plane mínimo

- cuentas de anfitrión;
- PostgreSQL;
- creación de sesión;
- códigos;
- mapeo Session ↔ Room;
- expiración;
- QR propio.

### Fase 3 — Invitados y player binding

- identidad anónima;
- enlace público;
- vínculo seguro de player;
- autorización;
- reconexión.

### Fase 4 — Cola y estado en tiempo real

- búsqueda de biblioteca;
- agregar/eliminar solicitudes;
- sincronización;
- controles del anfitrión;
- límites;
- política de cola.

### Fase 5 — Servicio de adquisición

- búsqueda externa;
- descarga/importación;
- normalización;
- validación;
- escaneo;
- manejo de duplicados.

### Fase 6 — Pitch

- PoC;
- selección tecnológica;
- integración por canción;
- cache;
- sincronización;
- pruebas de CPU y latencia.

### Fase 7 — Seguridad y operación

- rate limiting;
- auditoría;
- backups;
- healthchecks;
- recuperación;
- cierre automático;
- reconciliación.

### Fase 8 — UX y dispositivos

- móvil;
- Fire TV;
- Smart TV;
- PWA;
- reconexión;
- accesibilidad.

## 26. Criterios de aceptación

La arquitectura se considerará validada para primera versión cuando se demuestre que:

- tres sesiones funcionan simultáneamente;
- una sola instancia del motor puede servirlas;
- cada sesión mantiene cola independiente;
- invitados no necesitan cuenta;
- el QR dirige a la sesión correcta;
- el código público no concede privilegios;
- cada player controla únicamente su sesión;
- Pause y Skip no afectan otras salas;
- una sesión no puede alterar otra;
- la biblioteca es compartida;
- el reinicio no corrompe datos;
- sesiones pueden reconciliarse después de reinicio;
- el acceso público utiliza HTTPS;
- los motores no quedan expuestos directamente;
- canciones y secretos permanecen fuera del repositorio;
- existe una estrategia viable de adquisición;
- existe una estrategia viable de pitch.

## 27. Decisiones resueltas

Se consideran resueltas por evidencia técnica:

1. Una sola instancia de Karaoke Eternal puede servir múltiples Rooms.
2. Las Rooms mantienen colas independientes.
3. La biblioteca puede compartirse.
4. Players simultáneos funcionan.
5. Pause y Skip están aislados.
6. La cola intercala cantantes.
7. Rooms y colas persisten después de reinicio.
8. El consumo de servidor observado es bajo.
9. Karaoke Eternal no cubre pitch.
10. Karaoke Eternal no cubre adquisición online.

## 28. Decisiones abiertas

Antes de iniciar desarrollo sustancial deben resolverse:

1. API exacta de integración con Karaoke Eternal.
2. Framework definitivo del Control Plane.
3. Modelo final de autenticación.
4. Mecanismo de player binding.
5. Estrategia de pitch.
6. Estrategia de adquisición.
7. política de máximo de canciones por invitado;
8. coanfitriones;
9. política de cierre e historial;
10. reconciliación ante Room faltante;
11. gestión de errores de codecs;
12. límites de concurrencia reales;
13. estrategia de actualización del motor.

## 29. Riesgos principales

### Dependencia de API no documentada

Mitigación:

- adapter;
- pruebas de contrato;
- versionado;
- contribución upstream.

### Falta de pitch

Mitigación:

- PoC temprano antes de producción.

### Adquisición de contenido

Mitigación:

- servicio separado;
- validación legal y técnica.

### Cambios upstream

Mitigación:

- fijar versión;
- pruebas de regresión;
- changelog;
- actualización controlada.

### Player web

Los navegadores pueden presentar diferencias de codecs o autoplay.

Mitigación:

- matriz de dispositivos;
- formatos recomendados;
- pruebas Fire TV/Smart TV;
- detección de errores.

## 30. Documentos relacionados

- `README.md`
- `docs/PROTOTYPE_VALIDATION.md`
- `docs/KARAOKE_ETERNAL_VALIDATION.md`
- `THIRD_PARTY_NOTICES.md`

`PROTOTYPE_VALIDATION.md` conserva la validación histórica de PiKaraoke.

`KARAOKE_ETERNAL_VALIDATION.md` documenta la prueba de concepto que motivó esta revisión arquitectónica.

## 31. Próximo paso

El siguiente paso ya no es probar múltiples instancias PiKaraoke.

El próximo trabajo técnico debe ser:

```text
documentar y validar el contrato programático entre Karaoke Propio y Karaoke Eternal
```

Objetivos inmediatos:

1. identificar API y eventos;
2. determinar lifecycle de Rooms;
3. determinar acceso programático a Queue;
4. determinar control de Player;
5. definir el primer `EngineAdapter`;
6. mantener PiKaraoke sin cambios como referencia funcional hasta resolver pitch y adquisición.
