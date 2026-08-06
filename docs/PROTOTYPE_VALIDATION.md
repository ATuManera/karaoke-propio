# Validación del prototipo

## Fecha

6 de agosto de 2026

## Estado

El prototipo inicial de Karaoke Propio fue validado satisfactoriamente en un entorno doméstico real.

## Arquitectura probada

```text
Servidor Ubuntu 22.04.5
└── Docker
    └── PiKaraoke 1.21.0
            |
            | Red local
            v
Amazon Fire TV Stick 4K
└── Amazon Silk
    └── Pantalla remota /splash
            |
            | Bluetooth
            v
JBL Charge 6
└── JBL EasySing Mics mediante dongle USB-C
```

## Componentes utilizados

- Servidor Ubuntu 22.04.5 LTS, arquitectura x86-64.
- Docker Engine 29.1.3.
- Docker Compose 5.0.0.
- PiKaraoke 1.21.0.
- Amazon Fire TV Stick 4K.
- Navegador Amazon Silk.
- JBL Charge 6.
- Dos micrófonos JBL EasySing Mics.
- Dongle USB-C JBL EasySing.
- Red local con dirección del servidor `192.168.68.170`.

## Pruebas satisfactorias

### Servidor y aplicación

- El contenedor inició correctamente y permaneció saludable.
- La interfaz principal respondió mediante HTTP.
- La pantalla remota `/splash` funcionó correctamente.
- La configuración y la biblioteca persistieron después de recrear el contenedor.
- La búsqueda y descarga de canciones funcionaron.
- La cola colaborativa funcionó.
- El nombre del cantante se mostró correctamente.

### Reproducción

- El video se reprodujo correctamente.
- El audio se reprodujo sin cortes.
- Audio y video permanecieron sincronizados.
- Las canciones descargadas previamente comenzaron rápidamente.
- Las canciones nuevas presentaron una espera breve mientras se descargaban.

### Cambio de tonalidad

- Se validó el cambio de tonalidad.
- Se probó satisfactoriamente una transposición de hasta `-12` semitonos.
- La velocidad de reproducción permaneció sin cambios.
- Audio y video continuaron sincronizados.
- No se produjeron cortes ni errores durante la transposición.

### Fire TV

- Amazon Silk abrió correctamente la pantalla `/splash`.
- El control remoto permitió confirmar la reproducción automática.
- La reproducción pasó correctamente a pantalla completa.
- El navegador permaneció abierto durante la reproducción.
- El Fire TV funcionó como reproductor sin que el servidor necesitara conexión HDMI al televisor.

### Bluetooth y audio

- El Fire TV se conectó directamente por Bluetooth al JBL Charge 6.
- El audio de PiKaraoke salió correctamente por el Charge 6.
- El volumen pudo controlarse.
- No se detectaron interrupciones Bluetooth.

### JBL EasySing Mics

- El dongle USB-C funcionó conectado al JBL Charge 6.
- Los dos micrófonos funcionaron correctamente.
- Las voces se mezclaron con la pista reproducida.
- La función de eliminación de voz mediante IA funcionó correctamente.
- PiKaraoke, Charge 6 y EasySing Mics funcionaron simultáneamente.

## Comportamientos conocidos

### Cambio de tono durante la reproducción

Cuando se cambia la tonalidad de una canción que ya está reproduciéndose, PiKaraoke:

1. Detiene la reproducción actual.
2. Coloca nuevamente la canción al inicio de la cola.
3. Inicia la canción desde el principio con la nueva tonalidad.

Para Karaoke Propio se recomienda seleccionar el tono antes de agregar la canción a la cola o advertir claramente que un cambio durante la reproducción reiniciará la pista.

### Descarga de canciones nuevas

Una canción que todavía no está en la biblioteca puede tardar algunos segundos en comenzar porque debe descargarse y prepararse antes de la reproducción.

## Resultado

El prototipo demuestra que la arquitectura técnica es viable:

- Servidor central headless en Docker.
- Navegador remoto en Fire TV.
- Control desde celulares y computadoras.
- Audio Bluetooth.
- Micrófonos inalámbricos.
- Eliminación de voz mediante hardware JBL.
- Cambio de tonalidad mediante PiKaraoke.

La siguiente etapa será incorporar la capa propia de anfitriones, sesiones independientes, códigos públicos, acceso de invitados mediante QR y múltiples salas simultáneas.
