# Tono personal — diseño

Dos funcionalidades relacionadas:

1. **Mi tono** — recordar y mostrar, por usuario y por canción, el pitch en el
   que esa persona canta mejor. Ejemplo real: *Bee Gees – I Started a Joke*
   en `-4` para Fernando.
2. **Asistente de tono** — ayudar a descubrir ese número la primera vez.

Ambas se apoyan en el pitch por solicitud que ya existe (`docs/FEATURES.md`,
sección «Per-request pitch»). Este documento no lo reemplaza: lo convierte de
una decisión que se toma a ciegas cada vez, en una que el sistema recuerda y
sabe proponer.

## 0. El dato que manda sobre todo el diseño

La biblioteca actual son **580 `.mp4` descargados de YouTube y 1 canción
UltraStar**. Esa proporción no es una casualidad de esta instalación: es la
consecuencia directa de que la adquisición práctica sea YouTube (USDB sigue
bloqueado tras login — ver `docs/SESSION_ARCHITECTURE.md` §6.2).

Esto importa porque el código ya existente que *parecía* la base natural para
recomendar un tono —`server/Media/songNotes.ts`, que lee la melodía nota a nota
desde el `song.txt` de UltraStar— **solo cubre el 0,2 % de la biblioteca**.

Diseñar el asistente alrededor de esos datos sería diseñarlo para la canción que
no se canta. La melodía UltraStar se conserva en el diseño, pero degradada a lo
que realmente es aquí: un caso de lujo poco frecuente, y —más útil— un conjunto
de datos con verdad conocida contra el cual validar los métodos que sí aplican
al otro 99,8 %.

## 1. Qué se puede y qué no se puede saber de un karaoke de YouTube

Antes de proponer algoritmos, conviene ser explícito sobre la información
disponible, porque casi todas las ideas atractivas se estrellan aquí.

| Pregunta | ¿Se puede responder desde un `.mp4` de YouTube? |
| --- | --- |
| ¿En qué tonalidad está la pista? | **Sí**, aproximada. Ya implementado: `detectKey()` en `pitch-worker` (Krumhansl-Schmuckler sobre croma). |
| ¿Qué notas tiene que cantar el cantante? | **No, en general.** Un karaoke es la pista sin voz principal: lo que se quiere medir es justamente lo que se eliminó. |
| ¿Qué tan alta es la canción para una persona? | **No directamente.** Requiere conocer la melodía *y* la voz de esa persona. |
| ¿La letra está disponible como texto? | **No.** Está quemada en el video, como píxeles. |

Y el punto que más se malinterpreta: **la tonalidad detectada no predice el
tono que necesita un cantante.** Una canción en Do mayor puede tener una melodía
grave o agudísima; el tonic no dice en qué registro está la voz. `detectKey()`
es útil para otra cosa (comparar dos versiones de la misma canción, §2.3), no
para recomendar semitonos.

Conclusión de diseño: **la recomendación tiene que ser empírica.** No se puede
deducir de los metadatos de la pista; hay que medirla contra la voz de la
persona, o heredarla de lo que otros ya midieron. Todo el resto del documento
sale de aquí.

## 2. Funcionalidad 1 — «Mi tono»

### 2.1 Modelo de datos

Nueva migración `012-pitch-prefs.sql`, siguiendo la forma de `songStars` (el
precedente exacto: un dato por usuario y por canción):

```sql
CREATE TABLE IF NOT EXISTS "songPitchPrefs" (
  "userId" INTEGER NOT NULL REFERENCES "users"("userId") ON DELETE CASCADE,
  "songId" INTEGER NOT NULL REFERENCES "songs"("songId") ON DELETE CASCADE,
  "pitchSemitones" INTEGER NOT NULL,

  -- 'assistant' | 'manual' | 'inferred'. Misma distinción que songCategories
  -- hace entre 'auto' y 'manual', y por la misma razón: lo que una persona
  -- decidió no puede ser pisado por lo que el sistema dedujo.
  "source" TEXT NOT NULL DEFAULT 'manual',

  -- sobre QUÉ grabación se determinó. Imprescindible aquí y no un lujo: los
  -- karaokes de YouTube vienen transpuestos con frecuencia, así que "-4" solo
  -- significa algo respecto de una pista concreta (ver 2.3).
  "mediaId" INTEGER REFERENCES "media"("mediaId") ON DELETE SET NULL,

  "dateUpdated" INTEGER NOT NULL,
  PRIMARY KEY ("userId", "songId")
);

CREATE INDEX IF NOT EXISTS "songPitchPrefs_userId" ON "songPitchPrefs" ("userId");
```

Clave por `(userId, songId)` y no por `(userId, mediaId)` porque el cantante
piensa en canciones, y la biblioteca se navega por canción. `mediaId` queda como
procedencia, no como identidad.

### 2.2 Precedencia entre fuentes

Tres maneras de que se escriba una fila, con reglas claras de quién pisa a quién:

- `assistant` — salió del asistente (§3). Máxima autoridad.
- `manual` — la persona marcó «recordar este tono» en el `PitchModal`.
  Equivale a `assistant`: ambas son una decisión consciente.
- `inferred` — se guardó sola, al encolar la canción con un pitch ≠ 0.

Regla: **`inferred` nunca sobrescribe a `manual` ni a `assistant`.** Cualquiera
de las dos conscientes sí sobrescribe a la otra y a `inferred`.

El `inferred` es lo que hace que la funcionalidad tenga valor desde el primer
día sin pedirle nada a nadie: quien ya viene eligiendo `-4` a mano cada vez,
deja de tener que recordarlo. Y es honesto llamarlo distinto, porque «el último
tono que usé» no es lo mismo que «mi mejor tono»: la UI lo muestra como
sugerencia («la última vez la cantaste en -4») y no como decisión.

### 2.3 Anclaje a la versión — el problema específico de YouTube

Dos subidas de YouTube de la misma canción no están necesariamente en la misma
tonalidad. Algunas están transpuestas a propósito («versión para mujer»), otras
van medio semitono arriba porque el video se subió acelerado. Un `-4` guardado
contra una pista puede ser un `-2` o un `-6` contra otra.

Con `numMedia > 1` (el `VersionModal` ya existe para eso), la regla es:

1. Si `mediaId` guardado == `mediaId` a encolar → se aplica tal cual.
2. Si difieren y hay `detectKey()` con confianza ≥ 0,7 en ambas → se propone el
   pitch ajustado por el intervalo entre los dos tonics, mostrando el ajuste
   («guardaste -4 en otra versión; en esta equivale a -3»). Nunca en silencio.
3. Si difieren y no hay confianza → se muestra el guardado marcado como «de otra
   versión», sin ajustar y sin ocultarlo.

El caso 2 es el único uso donde `detectKey()` predice algo de verdad: no dice
qué tono necesita una persona, pero sí cuánto se movió una pista respecto de
otra.

### 2.4 Dónde se ve

El pedido es explícito: que sirva **de recordatorio**. Entonces tiene que estar
donde se elige la canción, no escondido en un perfil.

- **`SongItem` (biblioteca)** — insignia discreta con el tono guardado (`-4`)
  junto a la estrella. Es el recordatorio principal: se ve *antes* de decidir.
  Solo la propia; los tonos ajenos no se muestran (§2.6).
- **`PitchModal`** — abre preseleccionado en el tono guardado, con una línea que
  dice de dónde viene («tu tono para esta canción», «la última vez la cantaste
  en…») y un checkbox «recordar este tono».
- **`QueueItem`** — ya muestra la insignia de pitch; sin cambios.
- **`SongInfo`** — el tono guardado, con fecha y con la opción de borrarlo.
- **Cuenta → «Mis tonos»** — la lista completa, editable, y **encolable**. En
  la práctica esta pantalla se convierte en el repertorio de la persona: las
  canciones que sabe que puede cantar, cada una ya en su tono. Obligarla a
  volver a la biblioteca a buscar una canción que ya está listada aquí, solo
  para volver a contestar una pregunta ya contestada, sería el camino largo.
  Encola con el `mediaId` guardado, que es la grabación contra la que se
  determinó el número, para que el tono siga significando lo mismo.

**Un tono se corrige en tres momentos, y los tres importan:**

1. **Al encolar**, en el `PitchModal`: abre en el tono guardado con la casilla
   ya marcada, así que mover el deslizador y confirmar lo actualiza. Es el
   camino principal, porque es cuando la persona está pensando en cantar.
2. **En «Mis tonos»**, con `−` / `+`. Es el camino para revisar en frío, sin
   estar encolando nada.
3. **Justo después de cantar**, que es cuando realmente se aprende el dato —
   todavía no existe. Requiere saber que una canción terminó, así que es
   trabajo aparte; ver §3 y la fase 2.

Corregir por cualquiera de las dos vías existentes guarda `manual`: es una
decisión, y desde ese momento ninguna observación automática puede pisarla.

### 2.5 Contrato cliente/servidor

Copia exacta del patrón de estrellas, que ya está resuelto en este código:

```
shared/actionTypes.ts
  SET_SONG_PITCH_PREF    = 'server/SET_SONG_PITCH_PREF'
  CLEAR_SONG_PITCH_PREF  = 'server/CLEAR_SONG_PITCH_PREF'
  PITCH_PREFS_PUSH       = 'user/PITCH_PREFS_PUSH'
```

- `server/Pitch/PitchPrefs.ts` — `get(userId)`, `set(...)`, `clear(userId, songId)`.
  `set()` valida con `isValidPitch()`, que ya existe y ya es la frontera de
  confianza para pitch (`shared/pitch.ts`).
- `server/Pitch/socket.ts` — handlers, registrados en `server/socket.ts` junto a
  los demás.
- Push del conjunto completo al conectar, junto a `STARS_PUSH` en
  `server/socket.ts`. Son pocos cientos de enteros; no amerita versionado como
  el de la biblioteca.
- `src/store/modules/userPitchPrefs.ts` — reducer optimista calcado de
  `userStars.ts`, incluido el reset en `LOGOUT` y `SOCKET_AUTH_ERROR`.

### 2.6 Alcance y privacidad

**No se emite en broadcast.** Las estrellas sí (`sock.server.emit`), porque el
conteo de estrellas es público por diseño. El tono cómodo de alguien es
información sobre su cuerpo, y en una fiesta es exactamente el tipo de dato del
que se hacen bromas. Se emite solo a los sockets del propio `userId`, para que
un mismo usuario en dos dispositivos quede sincronizado.

Queda abierta —como decisión de producto, no técnica— la posibilidad de que el
anfitrión vea los tonos de la sala para armar la cola. No se implementa ahora.

### 2.7 Invitados

Las cuentas de invitado se barren a las 24 h (`User.removeExpiredGuests`), así
que un tono guardado por un invitado dura lo que dura la fiesta. Es coherente:
`ON DELETE CASCADE` lo limpia solo, y no hay que tocar el barrido.

Vale la pena que sea visible en la UI («este recordatorio se pierde al terminar
la fiesta; crea una cuenta para conservarlo»), porque para la familia —que es
quien repite— la funcionalidad justamente vive de acumularse. Convertir un
invitado en cuenta conservando su `userId` es la vía natural y no requiere nada
nuevo en el modelo de datos.

## 3. Funcionalidad 2 — Asistente de tono

El objetivo: que alguien que nunca pensó en semitonos llegue a «`-4`» sin saber
qué es un semitono.

Cuatro niveles, ordenados **por cobertura de la biblioteca**, no por elegancia.
El nivel 1 funciona en las 580 canciones desde el primer día; el nivel 4 en una.

### 3.0 Nivel 0 — perfil de voz (una vez por persona)

Antes de hablar de canciones, hay que saber qué rango tiene la persona. Es lo
único que se mide una sola vez y sirve para toda la biblioteca.

**Prueba guiada con micrófono, en el navegador:**

1. La app toca una nota y pide imitarla, para calibrar y comprobar que el
   micrófono entrega algo utilizable.
2. Descenso: baja de a un semitono. La persona para **cuando deja de sonar
   cómodo**, no cuando ya no le sale. Esa distinción es todo el valor de la
   prueba y hay que decirla explícitamente en pantalla.
3. Ascenso: lo mismo hacia arriba.
4. Se registran cuatro números: rango absoluto y rango cómodo.

```sql
CREATE TABLE IF NOT EXISTS "voiceProfiles" (
  "userId" INTEGER PRIMARY KEY REFERENCES "users"("userId") ON DELETE CASCADE,
  "lowMidi" REAL NOT NULL,
  "highMidi" REAL NOT NULL,
  "comfortLowMidi" REAL NOT NULL,
  "comfortHighMidi" REAL NOT NULL,
  "dateUpdated" INTEGER NOT NULL
);
```

**Detección de pitch en el cliente**, no en el servidor: el audio del micrófono
no debe salir del navegador. Solo viajan los cuatro números. Esto no es solo
higiene de privacidad, es también lo que evita subir audio por wifi de fiesta.

Implementación en `src/lib/pitchDetect.ts`: autocorrelación normalizada
(McLeod/YIN simplificado) sobre `AnalyserNode.getFloatTimeDomainData()`. Sin
dependencias nuevas — el mismo criterio con el que `pitch-worker` tiene su FFT
escrita a mano. Precauciones obligatorias, que son donde estos detectores
fallan:

- **Errores de octava.** La autocorrelación cruda salta a la mitad o al doble
  con facilidad. Umbral de claridad, banda de búsqueda acotada (~65–1000 Hz) y
  mediana sobre una ventana sostenida de ~0,7 s antes de aceptar una nota.
- **Ruido de fiesta.** Si la claridad no supera el umbral, no se adivina: se
  pide repetir.
- **Liberar el micrófono** (`track.stop()`) al cerrar; un indicador de grabación
  encendido después de cerrar el modal es un bug de confianza, no cosmético.

**Alternativa sin micrófono** (obligatoria, ver §5.1): elegir tipo de voz
—soprano, mezzo, contralto, tenor, barítono, bajo— que rellena un rango nominal.
Es peor, y la UI debe decir que es una estimación.

### 3.1 Nivel 1 — escalera de audición (cobertura: 100 %)

**Este es el mecanismo principal**, precisamente porque no necesita saber nada
de la canción.

La app prepara fragmentos cortos (~20 s) de la canción en varios tonos y la
persona canta encima de cada uno, en su propio teléfono, y elige. Es lo que hace
cualquiera con el control de tono de un karaoke, pero ordenado para que
converja rápido:

- **Ronda 1** — tres opciones separadas por 3 semitonos, centradas en la mejor
  conjetura disponible (§3.4): p. ej. `-6 / -3 / 0`.
- **Ronda 2** — tres opciones de ±1 alrededor de la ganadora: `-5 / -4 / -3`.

Seis fragmentos de 20 s y se llega a precisión de un semitono. La persona nunca
ve la palabra «semitono»: ve «más grave / así está bien / más agudo».

Dos detalles que deciden si esto sirve o estorba:

- **El fragmento debe ser la parte difícil de la canción**, no la intro. Sin
  datos de melodía, se elige la ventana de 20 s con mayor energía RMS a partir
  del 30 % de la duración: aproxima el coro, que es donde está la nota que
  arruina la actuación. Con notas UltraStar (§3.3) se elige la ventana que
  contiene el pico melódico, que es exacto.
- **Reproducción privada**, en el dispositivo de quien prueba, jamás en el
  Player de la sala. El precedente y la razón ya están en el proyecto: la
  preview de adquisición se diseñó así para que nadie tenga que hacer sus
  pruebas delante de todos.

Al terminar: «Guardar `-4` como mi tono para esta canción» → escribe
`songPitchPrefs` con `source='assistant'` y encola con ese pitch.

### 3.2 Nivel 2 — canto guiado con micrófono (cobertura: 100 % con HTTPS)

Mejora el nivel 1 en lugar de reemplazarlo: reduce las dos rondas a una, y a
veces a cero.

Mientras suena el fragmento en tono original, el micrófono escucha lo que la
persona canta. Con el perfil de voz (§3.0) se calcula directamente cuánto se
excedió:

- Si el percentil 95 de lo cantado supera su techo cómodo en *k* semitonos, la
  conjetura inicial es `-round(k)`.
- Si todo cae muy por debajo de su piso cómodo, hacia arriba.
- **Si aparecen saltos de −12 dentro de una frase**, la persona se bajó una
  octava por su cuenta: señal fuerte de que la canción está demasiado alta, y
  además revela la altura real de la melodía en ese punto.

Es la evidencia más directa que existe, porque mide la interacción real entre
esa voz y esa pista, sin modelo intermedio. Su límite conocido: la gente
compensa sin darse cuenta, así que el resultado se propone como punto de partida
de la escalera, nunca como respuesta final sin confirmar.

### 3.3 Nivel 3 — tesitura acumulada de la canción (cobertura: creciente)

El pago de los niveles 1 y 2. Cada vez que alguien completa el asistente, la
canción acumula información:

```sql
CREATE TABLE IF NOT EXISTS "songTessitura" (
  "songId" INTEGER PRIMARY KEY REFERENCES "songs"("songId") ON DELETE CASCADE,
  "mediaId" INTEGER REFERENCES "media"("mediaId") ON DELETE SET NULL,
  -- percentiles MIDI de la melodía, ponderados por duración
  "p05Midi" REAL NOT NULL,
  "p50Midi" REAL NOT NULL,
  "p95Midi" REAL NOT NULL,
  "peakMidi" REAL NOT NULL,
  -- 'ultrastar' (exacta) | 'sung' (de micrófonos) | 'audio' (estimada)
  "source" TEXT NOT NULL,
  "confidence" REAL NOT NULL,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "dateUpdated" INTEGER NOT NULL
);
```

Con una fila aquí, **un usuario nuevo obtiene su recomendación al instante y sin
escuchar nada**: basta cruzar la tesitura de la canción con su perfil de voz
(§3.5). Ese es el objetivo final; los niveles 1 y 2 son cómo se llega.

Tres formas de llenarla, de más a menos confiable:

- **`ultrastar`** — exacta, desde `getSongNotes()`. Cobertura hoy: 1 canción.
- **`sung`** — de las capturas de micrófono del nivel 2, normalizadas a octava
  y agregadas por percentiles sobre varias personas. Los errores individuales se
  lavan en el percentil: no hace falta transcribir bien la melodía, solo acertar
  el registro.
- **`audio`** — estimación desde la pista. Ver la advertencia abajo.

**Sobre estimar la tesitura desde el audio (`audio`): riesgo alto, opcional.**
Un instrumental puro no tiene melodía que extraer, y ahí no hay método que
valga. Pero parte del catálogo de YouTube no es instrumental puro: hay
karaokes con coro guía, con melodía en sintetizador (los de origen MIDI), y
subidas que son la grabación original con la letra encima. En esos casos, una
estimación de *tesitura* —no de melodía nota a nota— es alcanzable: salience
armónica por trama en la banda vocal, quedarse solo con las tramas de alta
confianza, y sacar percentiles robustos. El listón es mucho más bajo que
transcribir.

Esto se propone explícitamente **como experimento medible, no como una
funcionalidad comprometida**: hay que detectar primero si la pista lleva o no
melodía, y una estimación segura de sí misma y equivocada es peor que no tener
ninguna. Se acepta solo con `confidence` alta, siempre queda subordinada a
`ultrastar` y `sung`, y la escalera de audición sigue disponible para
contradecirla. La única canción UltraStar de la biblioteca sirve como caso de
prueba con verdad conocida; con una sola no alcanza para validar nada, así que
validarlo pasa por conseguir un puñado más de `song.txt`.

### 3.4 Nivel 0 bis — conjeturas gratis, antes de medir nada

Para centrar la ronda 1 de la escalera y ahorrarle pasos a la gente, hay dos
señales que no cuestan absolutamente nada y que salen de la funcionalidad 1:

- **El historial de la propia persona.** Si Fernando eligió entre `-3` y `-5` en
  sus últimas quince canciones, la escalera debe abrir centrada en `-4`, no en
  `0`. Es la señal más fuerte y más barata que existe en todo este diseño: el
  registro de voz de alguien es una propiedad estable de esa persona, y ya está
  en `songPitchPrefs`.
- **Lo que otros eligieron para esta canción**, corregido por la diferencia
  entre sus registros y el de quien pregunta.

Ninguna de las dos justifica saltarse la confirmación, pero ambas convierten la
escalera de dos rondas en una.

### 3.5 El cálculo

Función pura en `shared/pitchRecommend.ts`, testeable sin navegador ni audio
—como `shared/pitch.ts` y `shared/notes.ts`, que ya siguen esa forma.

Entrada: tesitura de la canción (§3.3) y perfil de voz (§3.0). Para cada
`t ∈ [-12, +12]`:

```
sobreTecho = max(0, (p95 + t) - comfortHigh)   // semitonos por encima de lo cómodo
bajoPiso   = max(0, comfortLow - (p05 + t))
imposible  = max(0, (peak + t) - highMidi)     // notas fuera del rango absoluto
descentrado= |((p05 + p95)/2 + t) - (comfortLow + comfortHigh)/2|

costo(t) = 5*imposible + 3*sobreTecho + 2*bajoPiso + 0.4*descentrado + 0.15*|t|
```

Los pesos codifican decisiones de producto que conviene dejar escritas:

- **Asimetría arriba/abajo (3 vs 2).** Pasarse de agudo se oye como un fracaso;
  quedarse grave apenas se oye como falta de brillo.
- **`imposible` domina (5).** Una sola nota fuera del rango absoluto arruina la
  canción entera, aunque el resto calce perfecto.
- **`0.15*|t|`** prefiere transposiciones chicas a igualdad de todo lo demás:
  rubberband degrada, y una pista muy movida suena rara aunque la voz calce.

Devuelve las tres mejores opciones con una explicación en lenguaje llano («en
-4 toda la canción te queda dentro de tu rango cómodo; la nota más alta baja de
Fa4 a Do#4»), porque el número solo no permite estar en desacuerdo con él.

**Cuando no hay solución buena** —el rango cómodo de la persona es más angosto
que la canción— hay que decirlo en lugar de devolver el menos malo en silencio:
«esta canción exige 19 semitonos y tu rango cómodo tiene 14; en `-4` te queda
cómoda salvo el coro». Es información accionable: se elige otra canción, o se
canta el coro una octava abajo.

### 3.6 Dónde se entra

- `PitchModal` → «No sé qué tono… ayúdame».
- `SongInfo` → «Encontrar mi tono».
- Cuenta → «Mi voz» (crear o rehacer el perfil).

## 4. Cambios de infraestructura

### 4.1 Fragmentos en `pitch-worker`

La escalera de audición necesita fragmentos, no canciones enteras. Transponer
un `.mp4` completo son minutos; 20 s de audio son segundos.

- `POST /excerpt` con `startSeconds` / `durationSeconds`, o los mismos
  parámetros en `/transcode`. Reusa `buildArgs()` con `-ss` y `-t`.
- **Siempre audio, nunca video**, aunque la fuente sea `.mp4`: para elegir tono
  no hace falta la letra en pantalla, y evita copiar el stream de video.
- `POST /loudest-window` para elegir el fragmento (§3.1). El worker ya sabe
  decodificar PCM con ffmpeg para `detectKey()`; calcular RMS por ventanas es
  una función más sobre los mismos samples.

### 4.2 Caché y prioridad

- `cacheKey()` se extiende con la ventana del fragmento. Directorio aparte
  (`_excerpts/`) con barrido por antigüedad: son desechables, a diferencia de
  las variantes completas.
- **`PitchManager` necesita prioridad.** Hoy es una cola FIFO con
  `maxConcurrency = 2`. Un fragmento detrás de dos transcodificaciones completas
  deja a alguien mirando un spinner varios minutos y el asistente se vuelve
  inusable en plena fiesta —que es exactamente cuando se usa. Los plazos son
  distintos y hay que modelarlos: una canción completa debe estar lista *antes
  de su turno*; un fragmento, *ahora*. Los fragmentos pasan al frente.

### 4.3 Servir el fragmento

Ruta autenticada que exige pertenecer a la sala, sirviendo desde la caché. No
reutilizar la ruta de media normal: sirve archivos completos de biblioteca y no
tiene por qué aprender sobre fragmentos.

## 5. Restricciones y riesgos

### 5.1 El micrófono exige HTTPS — la restricción más dura

`getUserMedia()` solo existe en contexto seguro. Con la app abierta en
`http://192.168.x.x` **no hay micrófono**, y por lo tanto no hay perfil de voz
(§3.0) ni canto guiado (§3.2).

El stack ya soporta HTTPS público vía `KARAOKE_DOMAIN` con nginx-proxy +
acme-companion, pero el caso de uso real es una fiesta en casa donde los
invitados entran por la IP de la LAN escaneando el QR. Consecuencias:

- Los niveles 0 y 2 solo funcionan si la gente entra por el dominio público.
- **El nivel 1 (escalera de audición) no necesita micrófono** y funciona
  siempre. Esta es la razón de fondo por la que es el mecanismo principal y no
  el plan B.
- La alternativa por tipo de voz (§3.0) cubre el perfil sin micrófono.

Hay que detectar la ausencia de contexto seguro y decirlo, no dejar que
`getUserMedia` falle con un error de navegador sin explicación.

### 5.2 Calidad de la transposición

Más allá de ±6 semitonos, rubberband sobre una mezcla completa empieza a sonar
artificial. El rango sigue siendo ±12 (`shared/pitch.ts`), pero el asistente
advierte al pasar de 6 y sugiere buscar otra versión o cantar el coro una octava
abajo. Conviene medirlo con oídos reales antes de fijar el umbral en 6: es un
número heredado de la práctica, no de este código.

### 5.3 Otros

- **Errores de octava** en la detección de pitch: ver §3.0.
- **Versiones transpuestas** de YouTube: ver §2.3.
- **Invitados a 24 h**: ver §2.7.
- **Estimación desde audio**: riesgo asumido explícitamente en §3.3.

## 6. Fases

El orden está elegido para que cada fase sirva por sí sola aunque las siguientes
no se hagan nunca.

1. **Mi tono. — Implementada, incluida §2.4 completa.** Migración 012,
   `PitchPrefs`, socket, reducer, insignia en `SongItem`, `PitchModal`
   preseleccionado, `inferred` automático, vista «Mis tonos» en Cuenta y el
   tono propio dentro de `SongInfo`. Sin asistente: ya resuelve el pedido
   literal del recordatorio.

   Olvidar es total: destildar la casilla borra el tono guardado y además
   envía `rememberPitch: false` con el encolado, para que esa misma actuación
   no vuelva a registrarse como `inferred`. Sin ese detalle la insignia
   reaparecía atenuada y el olvido parecía ignorado.
2. **Escalera de audición.** Fragmentos en el worker, prioridad en
   `PitchManager`, modal del asistente. Cobertura completa de la biblioteca,
   sin micrófono, sin análisis. Aquí el asistente ya es utilizable.
3. **Perfil de voz + canto guiado.** Detección de pitch en cliente,
   `voiceProfiles`, `recommendPitch()`. Acorta la escalera. Solo con HTTPS.
4. **Tesitura acumulada.** `songTessitura` alimentada por capturas y por
   UltraStar. Recomendación instantánea para usuarios nuevos.
5. **Estimación desde audio.** Experimento, con criterio de éxito medible antes
   de exponerlo.

## 7. Pruebas

La mayor parte del riesgo está en funciones puras, que es donde se puede probar
de verdad:

- `recommendPitch()` — vitest en `shared/`, con casos construidos a mano:
  canción cómoda, canción demasiado alta, rango más angosto que la canción,
  empates entre candidatos. Es el que decide el número, así que es el que hay
  que fijar con tests.
- `pitchDetect()` — contra senoidales sintéticas de frecuencia conocida, más
  casos adversarios: octava baja con armónicos fuertes, señal con ruido, señal
  demasiado corta. Debe *rechazar* lo que no puede medir, no adivinar.
- Selección de ventana por RMS — contra un archivo con silencio, cuerpo y coro.
- Precedencia de `source` en `PitchPrefs.set()` — que `inferred` no pise a
  `manual` es una regla de negocio, y las reglas de negocio se rompen en
  refactors si no están en un test.
- Migración 012 arriba y abajo, como el resto.

## 8. Documentos relacionados

- `docs/FEATURES.md` — «Per-request pitch», de donde parte todo esto.
- `docs/SESSION_ARCHITECTURE.md` §6.1 y §17 — decisión original de pitch.
- `server/Pitch/` — `PitchManager`, caché, cliente del worker.
- `server/Media/songNotes.ts` — melodía UltraStar (0,2 % de la biblioteca).
