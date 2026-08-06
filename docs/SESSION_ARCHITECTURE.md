# Arquitectura de sesiones de Karaoke Propio

## Estado del documento

- Rama de trabajo: `feature/session-architecture`
- Estado: propuesta inicial para revisión
- Fecha: 6 de agosto de 2026
- Proyecto: `ATuManera/karaoke-propio`

## 1. Objetivo

Definir la arquitectura funcional y técnica de la capa propia de sesiones de Karaoke Propio.

La solución debe permitir que varios anfitriones ejecuten reuniones de karaoke simultáneas sobre una misma instalación, manteniendo separadas las colas, participantes, reproductores y controles de cada sesión.

PiKaraoke continuará utilizándose inicialmente como motor externo de reproducción y procesamiento audiovisual.

## 2. Requisitos confirmados

### 2.1 Anfitriones

- Los anfitriones deben autenticarse con una cuenta.
- Un anfitrión puede crear, administrar y cerrar sesiones.
- Un mismo anfitrión puede consultar su historial de sesiones.
- La primera versión debe impedir que una misma cuenta cree más sesiones simultáneas que el límite definido por la plataforma.
- El anfitrión puede controlar la cola, reproducción y participantes de sus sesiones.

### 2.2 Invitados

- Los invitados no necesitan cuenta, correo ni contraseña.
- Acceden mediante un enlace o código QR.
- Al ingresar, deben escribir un nombre visible.
- El sistema debe asignarles un identificador interno independiente del nombre.
- Dos participantes pueden usar el mismo nombre sin compartir identidad técnica.
- La identidad anónima debe conservarse durante la sesión en el navegador del invitado.

### 2.3 Sesiones

- Cada sesión recibe un código público único de seis caracteres.
- Deben excluirse caracteres ambiguos como `0`, `O`, `1`, `I` y `L`.
- Ejemplo de código: `Z3PNX7`.
- La duración predeterminada de una sesión es de doce horas.
- Una sesión puede encontrarse en estado:
  - `created`
  - `active`
  - `paused`
  - `closing`
  - `closed`
  - `expired`
- La primera versión debe admitir hasta tres sesiones activas simultáneamente.
- Cada sesión debe mantener de forma aislada:
  - anfitrión;
  - participantes;
  - cola;
  - canción actual;
  - tono por canción;
  - estado de reproducción;
  - pantalla reproductora;
  - configuración;
  - historial de eventos.

### 2.4 Reproductor

- Cada sesión tendrá una pantalla reproductora principal.
- El reproductor previsto es un Fire TV Stick 4K con Amazon Silk.
- El reproductor no requiere autenticación completa de anfitrión.
- Debe vincularse de forma segura a una sesión específica.
- El reproductor muestra:
  - video;
  - letras cuando estén incluidas;
  - cantante actual;
  - siguiente turno;
  - código QR;
  - estado de espera.
- Solo una pantalla debe actuar como reproductor principal por sesión en la primera versión.

### 2.5 Dominios

Dominio canónico:

```text
https://karaoke.gallarday.com
```

Dominios alternativos:

```text
https://karaoke.smarthome.pe
https://karaoke.casainteligente.pe
```

Los dominios alternativos deben redirigir al dominio canónico para evitar fragmentación de cookies, sesiones, WebSockets y URLs públicas.

## 3. Rutas públicas propuestas

### 3.1 Página inicial

```text
/
```

Funciones:

- acceso de anfitrión;
- ingreso manual de código de sesión;
- información básica del servicio.

### 3.2 Invitado

Ruta canónica interna:

```text
/s/Z3PNX7
```

Ruta abreviada admitida:

```text
/Z3PNX7
```

La ruta abreviada debe redirigir internamente a `/s/Z3PNX7`.

### 3.3 Anfitrión

```text
/host/Z3PNX7
```

Requiere autenticación y autorización sobre la sesión.

### 3.4 Reproductor

```text
/player/Z3PNX7
```

Debe requerir un token de vinculación o un proceso de emparejamiento controlado por el anfitrión.

### 3.5 Administración

```text
/admin
```

Reservado para administración de la plataforma.

### 3.6 API

```text
/api/v1/
```

### 3.7 Tiempo real

```text
/socket.io/
```

o una ruta WebSocket equivalente.

## 4. Arquitectura lógica

```text
Usuarios y dispositivos
        |
        v
Reverse proxy HTTPS
        |
        v
Karaoke Propio Web / Session Manager
        |
        +----------------------+
        |                      |
        v                      v
Base de datos             Coordinador de salas
        |                      |
        |             +--------+--------+
        |             |        |        |
        |             v        v        v
        |          Room 01  Room 02  Room 03
        |             |        |        |
        +-------------+--------+--------+
                      |
                      v
              Biblioteca compartida
```

## 5. Componentes

### 5.1 Session Manager

Responsabilidades:

- autenticación de anfitriones;
- creación de sesiones;
- generación de códigos;
- expiración de sesiones;
- administración de invitados;
- autorización;
- generación de QR;
- asignación de salas;
- coordinación de estado en tiempo real;
- registro de eventos;
- liberación de recursos.

### 5.2 Room Coordinator

Responsabilidades:

- mantener un inventario de motores disponibles;
- asignar una sala libre a una sesión;
- iniciar o preparar el motor;
- verificar salud;
- aislar configuración y cola;
- cerrar y liberar la sala;
- impedir asignaciones duplicadas.

### 5.3 Motores PiKaraoke

Primera versión:

- tres instancias independientes;
- una por sala;
- puertos internos distintos;
- datos de sesión separados;
- biblioteca de canciones compartida en modo controlado;
- acceso únicamente desde la red Docker;
- sin exposición directa a Internet.

Ejemplo conceptual:

```text
app-karaoke-room-01
app-karaoke-room-02
app-karaoke-room-03
```

### 5.4 Base de datos

Recomendación inicial: PostgreSQL.

Motivos:

- usuarios anfitriones;
- sesiones;
- invitados;
- asignaciones de sala;
- historial;
- concurrencia;
- restricciones de integridad;
- crecimiento futuro.

SQLite puede seguir perteneciendo internamente a cada PiKaraoke, pero no debe ser la base principal de la capa multiusuario.

### 5.5 Estado en tiempo real

Primera versión recomendada:

- Socket.IO o WebSocket;
- estado persistente esencial en PostgreSQL;
- estado efímero inicialmente en memoria si se ejecuta una sola instancia del Session Manager.

Redis no es obligatorio para el primer prototipo, pero debe quedar previsto si se despliegan varias réplicas del Session Manager o se requiere coordinación distribuida.

### 5.6 Reverse proxy

El contenedor propio debe conectarse a la red Docker externa:

```text
nginx-proxy
```

El tráfico público debe ingresar únicamente mediante `app-proxy`.

Los motores PiKaraoke no deben publicar puertos directamente a Internet.

## 6. Modelo de datos inicial

### 6.1 HostUser

Campos mínimos:

- `id`
- `email`
- `display_name`
- `password_hash`
- `status`
- `created_at`
- `updated_at`
- `last_login_at`

### 6.2 KaraokeSession

Campos mínimos:

- `id`
- `public_code`
- `host_user_id`
- `name`
- `status`
- `room_id`
- `created_at`
- `activated_at`
- `expires_at`
- `closed_at`
- `settings_json`

### 6.3 GuestParticipant

Campos mínimos:

- `id`
- `session_id`
- `guest_token_hash`
- `display_name`
- `status`
- `joined_at`
- `last_seen_at`
- `removed_at`

### 6.4 Room

Campos mínimos:

- `id`
- `name`
- `engine_type`
- `internal_url`
- `status`
- `current_session_id`
- `last_healthcheck_at`

### 6.5 PlayerBinding

Campos mínimos:

- `id`
- `session_id`
- `player_token_hash`
- `device_name`
- `status`
- `bound_at`
- `last_seen_at`
- `revoked_at`

### 6.6 SessionEvent

Campos mínimos:

- `id`
- `session_id`
- `actor_type`
- `actor_id`
- `event_type`
- `event_payload`
- `created_at`

## 7. Flujo de creación de sesión

1. El anfitrión inicia sesión.
2. Selecciona “Crear sesión”.
3. El Session Manager comprueba:
   - límite global de sesiones;
   - límite por anfitrión;
   - existencia de una sala disponible.
4. Genera un código público único.
5. Reserva una sala.
6. Inicializa o limpia el motor asignado.
7. Crea la sesión con vencimiento de doce horas.
8. Muestra:
   - enlace de invitados;
   - QR;
   - enlace o código de emparejamiento del reproductor;
   - panel del anfitrión.
9. La sesión pasa a estado `active`.

## 8. Flujo de acceso de invitado

1. El invitado escanea el QR.
2. Accede a `/s/{codigo}`.
3. El sistema verifica que la sesión esté activa.
4. Solicita un nombre visible.
5. Genera un token anónimo de alta entropía.
6. Almacena solo el hash del token en el servidor.
7. Conserva el token en una cookie segura del navegador.
8. El invitado puede:
   - buscar canciones;
   - elegir tono;
   - agregar a la cola;
   - ver su posición;
   - retirar una solicitud propia si la política lo permite.

## 9. Flujo de vinculación del reproductor

Propuesta:

1. El Fire TV abre `/player`.
2. El sistema muestra un código temporal de vinculación.
3. El anfitrión introduce ese código desde su panel.
4. El Session Manager vincula el dispositivo con la sesión.
5. El Fire TV recibe un token de reproductor.
6. El token se guarda localmente.
7. El reproductor abre automáticamente `/player/{codigo}`.
8. El anfitrión puede revocar el vínculo.

Este flujo es preferible a colocar un token sensible directamente en el QR público de invitados.

## 10. Seguridad

### 10.1 Autenticación

- Contraseñas con Argon2id o bcrypt.
- Cookies de sesión `HttpOnly`, `Secure` y `SameSite=Lax`.
- Protección CSRF en operaciones de anfitrión.
- Limitación de intentos de inicio de sesión.

### 10.2 Invitados

- Tokens anónimos aleatorios.
- No usar el nombre visible como identidad.
- Rate limiting por sesión, IP y token.
- Límite de canciones pendientes por invitado.
- Validación y normalización de nombres.

### 10.3 Códigos de sesión

- Seis caracteres no ambiguos.
- Generación criptográficamente segura.
- Comprobación de unicidad.
- Expiración.
- No otorgan privilegios administrativos.
- Posibilidad de regeneración por el anfitrión.

### 10.4 Contenedores

- Motores sin acceso público directo.
- Redes Docker separadas cuando corresponda.
- Volúmenes con permisos mínimos.
- Imágenes fijadas por versión.
- Sin secretos dentro del repositorio.
- Healthchecks.
- Copias de seguridad consistentes.

### 10.5 Contenido

- El repositorio no distribuye contenido multimedia.
- Las canciones permanecen fuera de Git.
- La responsabilidad de derechos recae en el operador de la instalación.

## 11. Biblioteca compartida

La biblioteca de canciones puede compartirse entre las tres salas para evitar descargas duplicadas.

Debe evaluarse cuidadosamente:

- acceso concurrente;
- escritura simultánea;
- escaneo de archivos;
- nombres temporales;
- posibles bloqueos;
- consistencia de la base interna de cada PiKaraoke.

La primera implementación debe validar si múltiples instancias de PiKaraoke pueden leer y escribir de forma segura sobre una carpeta común.

Alternativa conservadora:

- una carpeta central de biblioteca;
- un servicio de descarga único;
- motores de sala con acceso de solo lectura;
- sincronización o indexación controlada.

Esta decisión requiere una prueba técnica específica antes de cerrar la arquitectura física.

## 12. Decisiones abiertas

Antes de iniciar desarrollo deben resolverse:

1. Lenguaje y framework del Session Manager.
2. Método de integración con PiKaraoke:
   - API existente;
   - WebSocket;
   - proxy;
   - automatización de interfaz;
   - adaptación futura del código.
3. Estrategia segura para biblioteca compartida.
4. Control del tono antes de insertar una canción.
5. Persistencia de la cola por sesión.
6. Política de cola justa.
7. Cantidad máxima de canciones pendientes por invitado.
8. Coanfitriones.
9. Recuperación después de reinicio.
10. Política de cierre y conservación del historial.

## 13. Recomendación tecnológica inicial

Propuesta para evaluación:

### Backend

- Python 3.12
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- Socket.IO o WebSocket nativo

### Frontend

Opción inicial de menor complejidad:

- plantillas del servidor;
- HTMX;
- Alpine.js;
- CSS propio.

Opción posterior si la interfaz lo exige:

- React o Vue.

La primera versión debe priorizar simplicidad operativa, baja utilización de recursos y facilidad de mantenimiento.

## 14. Fases de implementación

### Fase 1 — Diseño y pruebas de integración

- documentar API y comportamiento de PiKaraoke;
- probar tres instancias simultáneas;
- verificar aislamiento;
- probar biblioteca compartida;
- definir contratos internos.

### Fase 2 — Session Manager mínimo

- cuentas de anfitrión;
- creación de sesión;
- códigos;
- asignación de sala;
- QR;
- ingreso de invitados;
- vínculo de reproductor.

### Fase 3 — Cola y control

- búsqueda;
- tono;
- inserción en cola;
- estado en tiempo real;
- controles del anfitrión;
- límites por invitado.

### Fase 4 — Seguridad y operación

- rate limiting;
- auditoría;
- backups;
- healthchecks;
- recuperación;
- cierre automático.

### Fase 5 — UX y dispositivos

- optimización móvil;
- pantalla Fire TV;
- PWA;
- reconexión automática;
- accesibilidad.

## 15. Criterios de aceptación de la arquitectura

La arquitectura se considerará validada cuando se demuestre que:

- tres sesiones funcionan simultáneamente;
- cada sesión mantiene su propia cola;
- los invitados no necesitan cuenta;
- los códigos no conceden privilegios administrativos;
- cada Fire TV controla únicamente su sala;
- una sesión no puede ver ni alterar otra;
- el cierre libera correctamente la sala;
- el reinicio no corrompe datos;
- el acceso público utiliza HTTPS;
- los motores no están expuestos directamente;
- canciones y secretos permanecen fuera del repositorio.

## 16. Próximo paso

Ejecutar una prueba técnica de tres instancias PiKaraoke aisladas antes de seleccionar definitivamente el framework y comenzar la implementación del Session Manager.
