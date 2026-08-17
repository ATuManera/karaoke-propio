# Tono personal — diseño

> **Estado del documento: 17 de agosto de 2026**
>
> - **Funcionalidad 1 — «Mi tono»: IMPLEMENTADA y operativa.**
> - **Funcionalidad 2A — feedback después de cantar: IMPLEMENTADA.**
>   Ver §12 para lo que quedó construido y las decisiones de nombre.
> - **Funcionalidad 2B y posteriores: EXPERIMENTALES / NO IMPLEMENTAR todavía.**
>
> Este documento reemplaza la versión anterior de `docs/PERSONAL_PITCH.md`.
> El alcance inmediato para desarrollo termina en la **Fase 2A**. Cualquier
> trabajo descrito desde 2B requiere una nueva decisión de producto y una
> especificación posterior.

Dos funcionalidades relacionadas:

1. **Mi tono** — recordar y mostrar, por usuario y por canción, el pitch en el
   que esa persona canta mejor.
2. **Asistente de tono** — ayudar a descubrir o corregir ese número.

Ambas se apoyan en el pitch por solicitud ya implementado
(`docs/FEATURES.md`, sección «Per-request pitch»). El principio rector es que
el tono cómodo es un dato **personal y empírico**: no debe deducirse a ciegas
de la tonalidad musical de la pista.

---

## 0. Principios de diseño

### 0.1 El dato más confiable es la experiencia real del cantante

La biblioteca actual está formada casi totalmente por `.mp4` de karaoke
obtenidos de YouTube y solo una proporción mínima dispone de melodía UltraStar
estructurada. En un karaoke instrumental ordinario:

- puede estimarse la tonalidad musical de la pista;
- no se conoce necesariamente la melodía que debe cantar la voz principal;
- la tonalidad de la pista no determina la tesitura vocal;
- dos versiones de la misma canción pueden venir transpuestas.

Por ello, el sistema debe priorizar:

1. lo que la persona **realmente cantó**;
2. lo que la persona **dice que le resultó cómodo o incómodo**;
3. sus tonos personales anteriores;
4. solo en fases futuras, inferencias estadísticas o análisis vocal.

### 0.2 La aplicación no debe exigir conocimientos musicales

La persona puede terminar sabiendo que su ajuste es `-4`, pero no debe necesitar
entender qué es un semitono para llegar a ese resultado.

Las preguntas se expresan en lenguaje cotidiano:

- «Muy alta»
- «Un poco alta»
- «Perfecta»
- «Un poco baja»
- «Muy baja»

### 0.3 Una respuesta consciente tiene más autoridad que una inferencia

Se mantiene la jerarquía ya implementada en `songPitchPrefs`:

- `assistant` — decisión obtenida mediante una interacción guiada;
- `manual` — decisión explícita de la persona en las pantallas existentes;
- `inferred` — dato guardado automáticamente a partir de un encolado.

Regla existente y obligatoria:

> `inferred` nunca sobrescribe `manual` ni `assistant`.

`manual` y `assistant` sí pueden sustituirse entre sí porque ambos representan
una decisión consciente.

### 0.4 Privacidad por defecto

Los tonos personales y el feedback asociado:

- pertenecen al usuario;
- no se emiten en broadcast a la sala;
- no se muestran en el Player;
- se sincronizan únicamente entre sockets del mismo `userId`.

### 0.5 El alcance actual debe permanecer pequeño

La Fase 2A **no** necesita:

- micrófono;
- HTTPS para captura de audio;
- análisis de voz;
- detección de tesitura;
- fragmentos de canciones;
- nuevas transcodificaciones;
- cambios en `pitch-worker`;
- cambios de prioridad o concurrencia en `PitchManager`;
- nuevas tablas permanentes.

La implementación debe reutilizar la infraestructura existente.

---

# 1. Funcionalidad 1 — «Mi tono»

## 1.1 Estado

**Implementada y funcionando.**

La migración existente `012-pitch-prefs.sql` crea:

```sql
CREATE TABLE IF NOT EXISTS "songPitchPrefs" (
  "userId" INTEGER NOT NULL REFERENCES "users"("userId") ON DELETE CASCADE,
  "songId" INTEGER NOT NULL REFERENCES "songs"("songId") ON DELETE CASCADE,
  "pitchSemitones" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "mediaId" INTEGER REFERENCES "media"("mediaId") ON DELETE SET NULL,
  "dateUpdated" INTEGER NOT NULL,
  PRIMARY KEY ("userId", "songId")
);

CREATE INDEX IF NOT EXISTS "songPitchPrefs_userId"
  ON "songPitchPrefs" ("userId");
```

La clave es `(userId, songId)` porque el cantante piensa en canciones.
`mediaId` conserva la procedencia de la grabación concreta contra la cual se
determinó el pitch.

## 1.2 Fuentes

Las fuentes existentes siguen significando:

- `assistant` — resultado de una decisión guiada por la aplicación;
- `manual` — elección explícita realizada por la persona;
- `inferred` — último pitch deducido automáticamente de un encolado.

La Fase 2A reutilizará `source='assistant'`.

**No se agrega un cuarto tipo de fuente.**

## 1.3 Anclaje a la versión

Dos grabaciones de YouTube de una misma canción pueden tener diferente
tonalidad. Por eso `mediaId` continúa siendo parte relevante del dato.

La Fase 2A debe guardar como procedencia el `mediaId` **realmente reproducido**,
no un `mediaId` enviado libremente por el cliente ni una versión que el servidor
suponga después.

Cuando la cola no fijó una versión explícita, debe resolverse en servidor con
la misma regla que usa `Queue.get()` para elegir la versión reproducida.

## 1.4 Dónde se ve actualmente

Se mantiene lo ya implementado:

- `SongItem` — insignia del tono personal;
- `PitchModal` — preselección y opción de recordar;
- `QueueItem` — pitch de la solicitud;
- `SongInfo` — tono personal y opción de borrarlo;
- Cuenta → **Mis tonos** — repertorio personal editable y encolable.

La Fase 2A agrega un tercer momento natural de corrección:

1. antes de cantar, en `PitchModal`;
2. en frío, desde **Mis tonos**;
3. **después de terminar de cantar**, cuando la experiencia acaba de ocurrir.

## 1.5 Contrato existente

Se conserva:

```text
SET_SONG_PITCH_PREF
CLEAR_SONG_PITCH_PREF
PITCH_PREFS_PUSH
```

y la lógica de:

- `server/Pitch/PitchPrefs.ts`;
- `server/Pitch/socket.ts`;
- `src/store/modules/userPitchPrefs.ts`;
- `shared/pitch.ts`.

La Fase 2A debe llamar a `PitchPrefs.set(...)` en vez de duplicar su lógica de
persistencia o precedencia.

## 1.6 Invitados

No se cambia el comportamiento actual.

Si un invitado guarda un tono mediante 2A, este pertenece a su `userId` y será
eliminado cuando se elimine la cuenta invitada mediante el mecanismo existente.

---

# 2. Funcionalidad 2 — Asistente de tono

El Asistente de tono se divide desde ahora en fases independientes.

Solo la **Fase 2A** está aprobada para implementación.

---

# 3. Fase 2A — Feedback después de cantar

## 3.1 Objetivo

Aprovechar el momento inmediatamente posterior a una actuación para preguntar al
cantante cómo le resultó el pitch utilizado y actualizar su tono personal.

La función debe responder una pregunta muy simple:

> **¿Cómo te quedó el tono?**

La persona no necesita hacer una prueba adicional ni escuchar fragmentos. Ya
cantó la canción completa, incluido el coro y las partes difíciles.

---

## 3.2 Experiencia de usuario

### 3.2.1 Cuándo aparece

El aviso aparece en el dispositivo personal del usuario **solo cuando la canción
terminó naturalmente**.

No aparece por:

- pulsar «siguiente»;
- saltar manualmente la canción;
- retirar la canción de la cola;
- error de reproducción;
- recarga del Player;
- cambio de sala;
- seek manual hacia otra posición;
- cualquier transición que no proceda del evento real `onEnd` del reproductor.

No se usa una heurística del tipo «reprodujo más del 80 %».
Para el MVP, corrección y simplicidad son preferibles a cobertura parcial.

### 3.2.2 A quién aparece

Solo al `userId` propietario de la entrada de cola que acaba de terminar.

Nunca debe aparecer:

- a todos los usuarios de la sala;
- al siguiente cantante;
- en la pantalla Player/TV;
- al administrador por el solo hecho de ser administrador.

Si el mismo usuario tiene dos dispositivos conectados, ambos pueden recibir el
aviso. Al responder en uno, debe resolverse en todos.

### 3.2.3 Presentación

Componente global, disponible mientras el usuario navega por Biblioteca, Cola,
Cuenta u otras pantallas normales.

Texto recomendado:

```text
¿Cómo te quedó el tono?

[Artista — Canción]
Cantaste en -3

Muy alta
Un poco alta
Perfecta
Un poco baja
Muy baja

No estoy seguro
```

El número puede mostrarse con `formatPitch()`, porque ya forma parte de la UX
existente. La palabra «semitono» no es necesaria.

El componente debe:

- ser fácil de usar en móvil;
- no aparecer en el Player;
- poder cerrarse;
- no impedir seguir navegando;
- evitar apilar varios diálogos iguales.

Un `Modal` o `bottom sheet` consistente con los componentes existentes es
aceptable. Debe priorizarse la reutilización de patrones UI del proyecto sobre
introducir una dependencia nueva.

### 3.2.4 Una sola pregunta pendiente por usuario

Para evitar una acumulación molesta durante una fiesta:

- como máximo existe **un feedback pendiente por `userId`**;
- si termina otra canción del mismo usuario antes de responder la anterior, el
  feedback más reciente reemplaza al anterior;
- una respuesta o descarte resuelve el feedback;
- un feedback pendiente vence después de **15 minutos**.

El estado pendiente es transitorio y vive en memoria del servidor.

No requiere migración ni persistencia en SQLite.

Si el servidor reinicia, los feedback pendientes se pierden. Esto es aceptable:
el dato valioso es la respuesta guardada, no el aviso pendiente.

### 3.2.5 Reconexión

Si el teléfono se desconecta brevemente y vuelve a autenticarse dentro de los
15 minutos:

- si aún existe feedback pendiente para ese `userId`, el servidor vuelve a
  enviarlo;
- si ya fue respondido, descartado o venció, no reaparece.

---

## 3.3 Respuestas y cálculo

El servidor recibe una **elección semántica**, nunca un pitch calculado por el
cliente.

Valores sugeridos:

```ts
type PitchFeedbackChoice =
  | 'much_too_high'
  | 'slightly_high'
  | 'good'
  | 'slightly_low'
  | 'much_too_low'
  | 'unsure'
```

Mapeo:

| Respuesta visible | Código | Ajuste respecto al pitch cantado |
| --- | --- | ---: |
| Muy alta | `much_too_high` | `-2` |
| Un poco alta | `slightly_high` | `-1` |
| Perfecta | `good` | `0` |
| Un poco baja | `slightly_low` | `+1` |
| Muy baja | `much_too_low` | `+2` |
| No estoy seguro | `unsure` | no guardar |

Ejemplo:

- actuación terminada en `-3`;
- usuario responde «Un poco alta»;
- próximo tono personal sugerido/guardado: `-4`.

La dirección es deliberada:

- si la canción quedó **alta**, se baja la pista;
- si quedó **baja**, se sube la pista.

### 3.3.1 Fuente guardada

Toda respuesta distinta de `unsure` se considera una interacción guiada y usa:

```text
source = 'assistant'
```

Esto incluye `good`.

Ejemplo importante:

- cantó en `0`;
- responde «Perfecta»;
- se debe guardar explícitamente `0` con `source='assistant'`.

`0` es un tono personal válido y confirmado; no debe interpretarse como
«ausencia de preferencia».

### 3.3.2 Relación con `rememberPitch`

`rememberPitch` controla el guardado automático realizado al encolar.

No debe desactivar la pregunta 2A.

Motivo:

- «no recordar este tono al encolar» evita una inferencia automática;
- responder después «Perfecta» o «Un poco alta» es una decisión nueva,
  explícita y voluntaria.

Si el usuario no quiere guardar nada, dispone de `No estoy seguro` o puede
cerrar el aviso.

### 3.3.3 Límites del pitch

No se duplican números mágicos.

Usar siempre:

```ts
PITCH_MIN
PITCH_MAX
PITCH_STEP
isValidPitch()
```

de `shared/pitch.ts`.

Para una respuesta con ajuste:

```text
rawTarget = performedPitch + delta
target = clamp(rawTarget, PITCH_MIN, PITCH_MAX)
```

Reglas:

1. si `target` es distinto del pitch cantado, se puede guardar `target`;
2. si el usuario pide bajar más estando ya en `PITCH_MIN`, o subir más estando
   ya en `PITCH_MAX`, **no** debe guardarse el mismo número como si fuera un tono
   cómodo;
3. en ese caso límite, se resuelve el feedback sin modificar la preferencia y se
   informa, por ejemplo:

```text
Esta versión sigue quedándote alta incluso en el tono más grave disponible.
Conviene probar otra versión.
```

Equivalente para el límite agudo.

Si `rawTarget` excede el límite pero `target` todavía cambia respecto del pitch
cantado, se guarda el límite alcanzable y se informa que se llegó al máximo
disponible.

---

## 3.4 Detección fiable del final

La implementación debe partir del evento real de finalización que ya existe.

Actualmente `PlayerController` entrega:

```tsx
onEnd={handleLoadNext}
```

al componente `Player`.

La Fase 2A debe separar conceptualmente:

1. **registrar que la actuación terminó naturalmente**;
2. **continuar con la lógica existente de cargar la siguiente canción**.

Forma esperada:

```text
Player.onEnd
    ↓
handleEnd()
    ├─ emite al servidor: terminó naturalmente queueId=X
    └─ ejecuta la lógica existente handleLoadNext()
```

No se debe deducir el final observando cambios posteriores de `queueId` porque
esos mismos cambios también ocurren cuando alguien salta una canción.

### 3.4.1 Acción nueva del Player

Agregar una acción explícita, nombre recomendado:

```text
PLAYER_EMIT_ENDED = 'server/PLAYER_EMIT_ENDED'
```

Payload mínimo:

```ts
{
  queueId: number
}
```

El cliente **no** envía:

- `userId`;
- `songId`;
- `mediaId`;
- pitch;
- target pitch.

Todos esos datos deben resolverse en servidor.

### 3.4.2 Validación en servidor

Ante `PLAYER_EMIT_ENDED`, el servidor debe:

1. validar `queueId`;
2. obtener el contexto real de esa entrada;
3. comprobar que pertenece a la misma sala del Player que notificó el final;
4. resolver:
   - `queueId`;
   - `roomId`;
   - `songId`;
   - `userId`;
   - `pitchSemitones`;
   - `mediaId` realmente seleccionado;
5. crear el feedback transitorio para ese `userId`;
6. emitirlo solo a sockets de ese usuario.

No confiar en información adicional enviada por el navegador.

---

## 3.5 Resolver correctamente `mediaId`

`Queue.getRow(queueId)` actualmente no devuelve la versión efectiva de media.

En cambio, `Queue.get(roomId)` ya resuelve la versión usando la relación con
`media`, incluida la regla de `isPreferred` cuando `queue.mediaId` es `NULL`.

Para 2A debe existir una función server-side específica, por ejemplo:

```ts
Queue.getPitchFeedbackContext(queueId)
```

que devuelva como mínimo:

```ts
{
  queueId: number
  roomId: number
  songId: number
  userId: number
  pitchSemitones: number
  mediaId: number
}
```

La consulta debe utilizar la **misma regla de selección de media que
`Queue.get()`**, para que la procedencia guardada en `songPitchPrefs.mediaId`
corresponda a la versión realmente reproducida.

No debe implementarse como:

```text
Queue.getRow() + usar cualquier media preferido encontrado después
```

si eso puede producir una versión distinta.

---

## 3.6 Estado transitorio del feedback

Crear una unidad pequeña y testeable del lado servidor. Nombre sugerido:

```text
server/Pitch/PitchFeedback.ts
```

Responsabilidades:

- crear un feedback desde el contexto de una actuación terminada;
- mantener como máximo uno pendiente por usuario;
- asignar `feedbackId`;
- aplicar TTL de 15 minutos;
- recuperar el pendiente al reconectar;
- validar que solo su propietario pueda responder;
- transformar la elección en delta;
- llamar a `PitchPrefs.set(...)`;
- resolver el feedback y notificar a todos los sockets del mismo usuario.

Estructura conceptual:

```ts
type PendingPitchFeedback = {
  feedbackId: string
  queueId: number
  roomId: number
  userId: number
  songId: number
  mediaId: number
  performedPitch: number
  createdAt: number
  expiresAt: number
}
```

`feedbackId` debe ser opaco. Puede usarse `crypto.randomUUID()` si encaja con el
runtime actual, sin añadir dependencias.

### 3.6.1 Duplicados de `onEnd`

Mientras exista un feedback pendiente para el mismo `queueId`, una notificación
duplicada de final no debe crear otro.

Además, conviene suprimir duplicados inmediatos del mismo `queueId` durante una
ventana corta de unos segundos, para no recrear el aviso si un navegador emite
accidentalmente `onEnd` dos veces.

Una repetición real de la canción más adelante puede generar un feedback nuevo.

---

## 3.7 Contrato socket de 2A

Nombres recomendados:

```text
PLAYER_EMIT_ENDED        = 'server/PLAYER_EMIT_ENDED'
PITCH_FEEDBACK_PUSH      = 'user/PITCH_FEEDBACK_PUSH'
PITCH_FEEDBACK_RESPOND   = 'server/PITCH_FEEDBACK_RESPOND'
PITCH_FEEDBACK_RESOLVED  = 'user/PITCH_FEEDBACK_RESOLVED'
```

### 3.7.1 Push

Payload al usuario:

```ts
type PitchFeedbackPrompt = {
  feedbackId: string
  queueId: number
  songId: number
  pitchSemitones: number
  expiresAt: number
}
```

`mediaId` no necesita exponerse al cliente para responder.

El cliente puede resolver artista/título desde `songId` usando el estado de
biblioteca ya existente. Si por cualquier motivo no encuentra el metadato, el
aviso debe seguir siendo usable con un texto genérico.

### 3.7.2 Respuesta

El cliente envía solamente:

```ts
{
  feedbackId: string
  choice: PitchFeedbackChoice
}
```

El servidor recupera de su estado transitorio:

- usuario;
- canción;
- versión;
- pitch ejecutado.

Así se evita permitir que el cliente modifique arbitrariamente la preferencia
de otro usuario o responda sobre otra canción.

### 3.7.3 Resolución

Después de guardar, descartar, vencer o reemplazar un feedback:

```text
PITCH_FEEDBACK_RESOLVED
```

se envía a todos los sockets del mismo usuario.

La UI debe cerrar ese feedback en todos los dispositivos.

Cuando se guarda una preferencia, además se reutiliza el mecanismo existente de
`PITCH_PREFS_PUSH` para mantener sincronizadas las vistas de «Mi tono».

---

## 3.8 Comportamiento al responder

### `good`

```text
target = performedPitch
PitchPrefs.set(
  userId,
  songId,
  target,
  source='assistant',
  mediaId
)
```

Mensaje sugerido:

```text
Guardado: este tono te quedó bien.
```

### `slightly_high`

```text
target = performedPitch - 1
```

Mensaje sugerido:

```text
Guardado: la próxima vez probaremos -4.
```

### `much_too_high`

```text
target = performedPitch - 2
```

### `slightly_low`

```text
target = performedPitch + 1
```

### `much_too_low`

```text
target = performedPitch + 2
```

### `unsure`

- no escribe en `songPitchPrefs`;
- no modifica una preferencia anterior;
- resuelve el feedback.

El botón cerrar (`X`) debe tener el mismo efecto de persistencia que `unsure`:
**no guardar nada**.

---

## 3.9 Qué ocurre con una preferencia previa

El cálculo siempre parte del pitch **realmente cantado**, no de la preferencia
preexistente.

Ejemplo:

- `songPitchPrefs` guardaba `-3`;
- el usuario decide probar `-1`;
- termina la canción en `-1`;
- responde «Un poco alta»;
- el nuevo valor es `-2`.

No se calcula `-4` a partir del valor antiguo.

La respuesta 2A es consciente (`assistant`) y puede reemplazar una preferencia
previa `manual`, `assistant` o `inferred`, conforme a las reglas existentes.

---

## 3.10 Estado cliente

Agregar un estado cliente pequeño para el feedback pendiente.

Nombre sugerido:

```text
src/store/modules/userPitchFeedback.ts
```

Responsabilidades:

- recibir `PITCH_FEEDBACK_PUSH`;
- almacenar un único prompt;
- recibir `PITCH_FEEDBACK_RESOLVED`;
- limpiar el prompt;
- limpiar estado en `LOGOUT`;
- limpiar estado en `SOCKET_AUTH_ERROR`.

No debe almacenar el resultado permanente. Ese dato pertenece a
`userPitchPrefs`.

---

## 3.11 Componente UI global

Nombre sugerido:

```text
PitchFeedbackPrompt
```

o equivalente consistente con el proyecto.

Debe montarse en el shell autenticado/global, no dentro del Player ni de una
ruta específica.

Requisitos:

- responsive para móvil;
- accesible por teclado;
- texto claro;
- botones suficientemente grandes;
- `aria-label` cuando corresponda;
- cierre sin guardar;
- deshabilitar botones mientras se procesa una respuesta para evitar doble
  envío;
- feedback visual de éxito;
- no depender de tener abierta la pantalla Cola.

Si ya existe un sistema global de toast/alert/modal, reutilizarlo.

---

## 3.12 Concurrencia y rendimiento

La Fase 2A:

- no crea trabajos FFmpeg;
- no consume slots de `PitchManager`;
- no modifica `maxConcurrency`;
- no crea archivos temporales;
- no consulta `pitch-worker`;
- no debe afectar el tiempo de preparación de la siguiente canción.

El evento de feedback no debe bloquear `handleLoadNext()` esperando una
respuesta del servidor.

La secuencia de final debe seguir siendo inmediata:

```text
termina canción
→ se notifica feedback
→ el Player continúa normalmente con la siguiente
```

---

## 3.13 Seguridad y confianza

El servidor es autoridad.

Debe rechazar:

- `feedbackId` inexistente;
- feedback vencido;
- respuesta de un `userId` distinto al propietario;
- `choice` fuera del enum permitido;
- pitch resultante inválido;
- contexto de cola inexistente o inconsistente.

No confiar en valores de pitch suministrados por el cliente.

El sistema no necesita guardar un historial de respuestas 2A en esta fase.

---

## 3.14 Logging

Agregar logging operativo mínimo y no sensible, suficiente para diagnóstico.

Ejemplos:

```text
pitch-feedback created feedbackId=... queueId=... userId=...
pitch-feedback responded feedbackId=... choice=... target=...
pitch-feedback dismissed feedbackId=...
pitch-feedback expired feedbackId=...
```

No registrar audio ni datos biométricos porque 2A no los utiliza.

Si el proyecto dispone de logger estructurado, seguir ese patrón en lugar de
introducir `console.log` arbitrario.

---

# 4. Plan de implementación de Fase 2A

Claude Code debe inspeccionar el código actual antes de cambiarlo y adaptar los
nombres a las convenciones reales. La lista siguiente describe responsabilidades,
no obliga a crear archivos innecesarios.

## 4.1 Shared

### `app/shared/actionTypes.ts`

Agregar las cuatro acciones de 2A:

```text
PLAYER_EMIT_ENDED
PITCH_FEEDBACK_PUSH
PITCH_FEEDBACK_RESPOND
PITCH_FEEDBACK_RESOLVED
```

### Tipos compartidos

Ubicar en `shared/types.ts`, `shared/pitch.ts` o un archivo compartido pequeño,
según la organización existente:

```ts
PitchFeedbackChoice
PitchFeedbackPrompt
```

Evitar `any`.

---

## 4.2 Player cliente

### `app/src/routes/Player/components/PlayerController/PlayerController.tsx`

Actualmente:

```tsx
onEnd={handleLoadNext}
```

Cambiar a un handler que:

1. capture el `queueId` terminado;
2. despache `PLAYER_EMIT_ENDED`;
3. llame inmediatamente a la lógica existente de `handleLoadNext()`.

El flujo manual «siguiente» debe continuar llamando a `handleLoadNext()` sin
emitir `PLAYER_EMIT_ENDED`.

No alterar la lógica de round-robin, historial, replay, error o selección de
siguiente usuario salvo lo estrictamente necesario.

---

## 4.3 Queue servidor

### `app/server/Queue/Queue.ts`

Agregar una forma server-side de resolver el contexto exacto de una actuación,
incluido `mediaId` efectivo.

La selección de media debe ser equivalente a `Queue.get()`.

Agregar tests para:

- cola con `mediaId` explícito;
- cola con `mediaId=NULL` y media preferido;
- múltiples versiones;
- `queueId` inexistente.

---

## 4.4 Pitch feedback servidor

### `app/server/Pitch/PitchFeedback.ts` — sugerido

Implementar el estado efímero descrito en §3.6.

No crear migración.

### `app/server/Pitch/socket.ts`

Registrar:

- respuesta del usuario;
- push/resolved dirigido solamente al propio usuario.

### `app/server/Player/socket.ts`

Registrar `PLAYER_EMIT_ENDED`, validar sala/contexto y crear el feedback.

Si la arquitectura actual recomienda que toda la lógica esté encapsulada en
`PitchFeedback`, mantener `Player/socket.ts` delgado.

### Conexión/autenticación

En el punto donde hoy se envían al usuario sus `PITCH_PREFS_PUSH`, volver a
enviar también el feedback pendiente, si existe y sigue vigente.

---

## 4.5 Cliente normal

### Store

Agregar el reducer del feedback.

### UI

Montar `PitchFeedbackPrompt` globalmente para usuarios autenticados de la sala.

No montarlo dentro del componente Player.

---

## 4.6 Persistencia

Reutilizar exclusivamente:

```text
songPitchPrefs
PitchPrefs.set(...)
```

No agregar:

- `pitchFeedbackHistory`;
- `voiceProfiles`;
- `songTessitura`;
- otra tabla de aprendizaje.

---

# 5. Pruebas obligatorias de Fase 2A

## 5.1 Unitarias — cálculo

Casos mínimos:

1. `-3 + slightly_high → -4`;
2. `-3 + much_too_high → -5`;
3. `-3 + good → -3`;
4. `-3 + slightly_low → -2`;
5. `-3 + much_too_low → -1`;
6. `0 + good → 0`;
7. límite inferior;
8. límite superior;
9. `unsure` no produce escritura.

El mapeo elección → delta conviene implementarlo como función pura.

## 5.2 Unitarias — servidor

Verificar:

- `PLAYER_EMIT_ENDED` genera feedback para el propietario correcto;
- el feedback contiene el pitch realmente usado;
- el `mediaId` corresponde a la versión reproducida;
- solo se conserva un pendiente por usuario;
- uno nuevo reemplaza al anterior;
- TTL expira;
- reconexión vuelve a enviar un pendiente vigente;
- otro usuario no puede responder;
- `choice` inválido se rechaza;
- responder guarda `source='assistant'`;
- `good` guarda también pitch `0`;
- `unsure` no toca una preferencia existente;
- respuesta consciente puede reemplazar `inferred`;
- respuesta consciente puede reemplazar `manual`/`assistant`;
- todos los sockets del mismo usuario reciben resolución;
- otros usuarios no reciben el payload privado.

## 5.3 Integración Player

Verificar:

### Final natural

```text
onEnd
→ feedback
→ siguiente canción continúa
```

### Skip manual

```text
siguiente
→ siguiente canción
→ NO feedback
```

### Error

```text
error de media
→ NO feedback
```

### Replay

Una reproducción real que termina naturalmente puede generar feedback. Deben
evitarse únicamente duplicados inmediatos accidentales del mismo `onEnd`.

## 5.4 Cliente

Verificar:

- aparece el prompt correcto;
- cada botón envía el enum correcto;
- el cliente no calcula ni envía el pitch final;
- cerrar no guarda;
- resolución en otro dispositivo cierra el aviso;
- logout limpia estado;
- el prompt puede aparecer estando en Biblioteca, Cola o Cuenta;
- nunca aparece en Player.

---

# 6. Criterios de aceptación

La Fase 2A se considera terminada únicamente si se cumplen todos los siguientes:

1. Una canción que llega a su final natural genera la pregunta al cantante.
2. Un skip manual no genera la pregunta.
3. Un error de reproducción no genera la pregunta.
4. La pregunta no aparece en la TV/Player.
5. La pregunta no se emite a otros usuarios.
6. Las cinco respuestas de valoración producen el ajuste esperado.
7. «No estoy seguro» y cerrar no modifican datos.
8. El servidor, no el cliente, calcula el pitch resultante.
9. Se guarda `source='assistant'`.
10. Se guarda el `mediaId` de la versión realmente reproducida.
11. `0` puede guardarse explícitamente como tono personal.
12. Se respetan `PITCH_MIN` y `PITCH_MAX`.
13. Un feedback respondido desaparece en todos los dispositivos del usuario.
14. Un feedback pendiente puede reaparecer tras una reconexión breve.
15. Solo existe un feedback pendiente por usuario.
16. Los feedback pendientes vencen a los 15 minutos.
17. No se introduce ninguna nueva tabla permanente.
18. No se modifica `pitch-worker`.
19. No se modifica la concurrencia ni la prioridad de `PitchManager`.
20. Todas las pruebas nuevas y las existentes pasan.
21. Build/lint/typecheck del proyecto quedan limpios.
22. `docs/PERSONAL_PITCH.md` y, si corresponde, `docs/FEATURES.md` reflejan el
    estado implementado al cerrar el trabajo.

---

# 7. Fuera de alcance de Fase 2A

Claude Code **NO DEBE implementar** en este encargo:

- botón «Encontrar mi tono»;
- fragmentos o excerpts;
- escalera A/B/C;
- búsqueda adaptativa;
- análisis RMS de fragmentos;
- cambios de caché para excerpts;
- prioridades nuevas en `PitchManager`;
- modelo estadístico entre usuarios;
- baseline vocal por usuario;
- offsets por canción;
- captura de micrófono;
- detección de frecuencia fundamental;
- perfil de voz;
- clasificación soprano/tenor/etc.;
- `voiceProfiles`;
- `songTessitura`;
- recomendación por tesitura;
- extracción automática de melodía;
- estimación desde audio;
- cambios de `detectKey()` para recomendar el tono de una persona.

Si durante la implementación aparece una necesidad técnica que parece exigir uno
de esos elementos, debe considerarse una señal para revisar el diseño, no una
autorización para ampliar alcance.

---

# 8. Fases futuras — experimentales, sujetas a discusión

Esta sección conserva únicamente el roadmap conceptual. **No constituye una
especificación de implementación.**

## 8.1 Fase 2B — escalera adaptativa de audición

Idea a discutir:

- escuchar/cantar fragmentos cortos de la misma canción;
- conservar video/letra cuando sea necesario;
- comparar opciones A/B/C sin obligar a entender semitonos;
- expandir la búsqueda si la mejor opción queda en un extremo;
- refinar después en pasos de ±1;
- elegir manualmente otra sección si el fragmento automático no es adecuado.

Pendientes antes de aprobar:

- UX exacta;
- selección de fragmento;
- video vs. audio;
- tiempo de preparación;
- scheduling de transcodificación;
- impacto sobre la cola global de pitch;
- caché;
- pruebas con usuarios reales.

## 8.2 Fase 2C — predicción empírica

Idea a discutir:

```text
pitch esperado de usuario/canción
≈ baseline del usuario + offset relativo de la canción
```

Podría aprender de `songPitchPrefs` sin comprender la melodía.

Pendientes:

- tamaño mínimo de muestra;
- pesos por `source`;
- robustez ante distintas versiones;
- privacidad;
- tratamiento de outliers;
- confianza de la recomendación.

## 8.3 Fase 2D — perfil vocal y micrófono

Experimental.

Antes de aprobar habría que validar en ambiente real:

- ruido de fiesta;
- acompañamiento que entra por el micrófono;
- errores de octava;
- necesidad de auriculares;
- HTTPS;
- privacidad;
- valor incremental respecto de 2A/2B/2C.

No debe ser requisito para que el Asistente de tono funcione.

## 8.4 Fase 2E — tesitura y análisis avanzado

Experimental.

Fuentes posibles futuras:

- UltraStar;
- MIDI u otros formatos estructurados;
- estimaciones de melodía;
- datos agregados de actuaciones.

No se debe considerar verdad confiable una tesitura inferida de usuarios o de
audio sin una validación específica.

---

# 9. Decisiones descartadas por ahora

La versión anterior del documento proponía construir primero un perfil vocal,
usar RMS para encontrar automáticamente el coro, generar fragmentos solo de
audio y derivar `songTessitura` de cantantes.

Esas propuestas **no forman parte del diseño aprobado actual**.

Motivos principales:

- agregan complejidad antes de explotar el dato más sencillo y confiable;
- el RMS de la mezcla no equivale a dificultad vocal;
- audio sin video puede privar al cantante de las letras quemadas en el MP4;
- el micrófono en una fiesta recibe voz, backing track, ruido y reverberación;
- una persona puede cantar otra octava, armonizar o modificar la melodía;
- ninguna de esas técnicas es necesaria para obtener valor de 2A.

Podrán reconsiderarse con pruebas controladas.

---

# 10. Documentos y código relacionados

- `docs/FEATURES.md` — pitch por solicitud y «Mi tono».
- `docs/SESSION_ARCHITECTURE.md` — decisiones arquitectónicas del proyecto.
- `app/shared/pitch.ts` — `PITCH_MIN`, `PITCH_MAX`, `PITCH_STEP`,
  `isValidPitch()`, `formatPitch()`.
- `app/server/Pitch/PitchPrefs.ts` — persistencia de preferencias.
- `app/server/Pitch/socket.ts` — sincronización de preferencias.
- `app/server/Queue/Queue.ts` — resolución de entradas y media efectivo.
- `app/server/Player/socket.ts` — estado/eventos del Player.
- `app/src/routes/Player/components/PlayerController/PlayerController.tsx` —
  `onEnd` y avance a la siguiente canción.
- `app/src/routes/Player/components/Player/Player.tsx` — evento real de fin de
  reproducción.

---

# 11. Regla de cierre para la implementación original

La orden de implementación asociada a este documento es:

> **Implementar únicamente la Fase 2A hasta satisfacer los criterios de
> aceptación del §6. No implementar ninguna fase 2B o posterior.**

Una vez validada 2A en uso real, el roadmap desde 2B debe volver a discutirse con
evidencia del comportamiento observado y no asumirse automáticamente como la
siguiente tarea.

---

# 12. Fase 2A — lo implementado

Esta sección describe el código entregado. Donde difiere de los nombres
*sugeridos* arriba, manda esta sección.

## 12.1 Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `app/shared/pitchFeedback.ts` | enum de respuestas, mapeo respuesta → delta, `resolvePitchFeedback()`, TTL y tipos del contrato |
| `app/shared/actionTypes.ts` | `PLAYER_EMIT_ENDED`, `PITCH_FEEDBACK_PUSH`, `PITCH_FEEDBACK_RESPOND`, `PITCH_FEEDBACK_RESOLVED` |
| `app/server/Queue/Queue.ts` | `Queue.getPerformance(queueId)` — contexto real de una actuación, con el media efectivo |
| `app/server/Pitch/PitchFeedback.ts` | estado efímero: uno pendiente por usuario, TTL, deduplicación, respuesta y escritura vía `PitchPrefs.set()` |
| `app/server/Pitch/socket.ts` | `createPitchFeedback()`, `pushPitchFeedback()` y el handler de respuesta |
| `app/server/Player/socket.ts` | handler de `PLAYER_EMIT_ENDED` (delgado: valida el `queueId` y delega) |
| `app/server/socket.ts` | reenvío del pendiente al (re)conectar, junto a `PITCH_PREFS_PUSH` |
| `app/src/routes/Player/.../PlayerController.tsx` | `handleEnd()` — avisa y llama de inmediato a `handleLoadNext()` |
| `app/src/store/modules/userPitchFeedback.ts` | prompt único, estado de envío y resolución |
| `app/src/components/PitchFeedbackPrompt/` | la pregunta, montada en `CoreLayout` fuera de la ruta `/player` |

Pruebas: `app/shared/pitchFeedback.test.ts` (cálculo puro),
`app/server/Pitch/pitchFeedback.test.ts` (estado, permisos y sockets) y los casos
de `Queue.getPerformance` en `app/server/Queue/Queue.test.ts`.

No se creó ninguna tabla ni migración.

## 12.2 Decisiones tomadas durante la implementación

**`Queue.getPerformance()` en vez de `Queue.getPitchFeedbackContext()`.** La
consulta describe una actuación —quién, qué canción, qué versión, en qué tono—
y no tiene nada que ver con el feedback; nombrarla por su consumidor ataría
`Queue` a una funcionalidad de `Pitch`. La regla de selección de media es la
misma de `Queue.get()`, con los mismos JOIN, y hay tests que comparan ambas.

**El texto de confirmación se arma en el cliente.** `PITCH_FEEDBACK_RESOLVED`
lleva `{ feedbackId, pitchSemitones, limit }`: el servidor sigue siendo la
autoridad sobre el número, y la redacción vive junto al resto de la UI en vez de
viajar por el socket. `limit` distingue los tres finales posibles: se guardó, se
guardó llegando al extremo disponible, o no se guardó nada porque ya estaba en
el extremo.

**Cerrar la tarjeta envía `unsure`.** Así el descarte también resuelve la
pregunta en el servidor y no reaparece en la próxima reconexión, cumpliendo
§3.8 sin escribir nada.

**Bottom sheet, no `Modal`.** §3.2.3 pide que no impida seguir navegando, y un
`<dialog showModal>` bloquea justamente eso. La tarjeta usa los mismos tokens de
color, radio y sombra del proyecto, y se ancla sobre la navegación.

**El vencimiento también ocurre en el cliente.** El servidor lo aplica de forma
perezosa (sin timers); la tarjeta se retira sola usando `expiresAt` cuando ese
valor cae dentro de la ventana esperada, y el TTL completo cuando no —un
teléfono con la hora mal puesta no debe perder la pregunta apenas llega.

**`webpack.config.js` aprendió `extensionAlias`.** `shared/pitchFeedback.ts` es
el primer archivo de `shared/` que importa a otro, y el servidor exige el
sufijo `.js` explícito (module `node16`) que el bundler no resolvía.
