# Karaoke Propio

Plataforma web open source y autoalojada para organizar sesiones de karaoke multiusuario, desarrollada y mantenida por **A Tu Manera**.

## Visión

Karaoke Propio busca ofrecer una experiencia de karaoke familiar y social sin suscripciones, accesible desde navegadores web, teléfonos móviles y dispositivos conectados al televisor.

La arquitectura prevista permitirá que:

- Los anfitriones autenticados creen sesiones independientes.
- Cada sesión reciba un código público único de seis caracteres.
- Los invitados ingresen mediante un código QR sin crear una cuenta.
- Cada invitado se identifique únicamente con su nombre.
- Cada sesión tenga su propia cola, participantes, controles y reproductor.
- Varias sesiones puedan funcionar simultáneamente.
- Un Fire TV, Smart TV u otro navegador funcione como pantalla remota.
- Las canciones puedan reproducirse con cambio de tonalidad.

## Estado actual

El proyecto se encuentra en una etapa inicial de prototipo.

La línea base actual ejecuta **PiKaraoke 1.21.0** como motor externo mediante Docker y proporciona:

- Interfaz web local.
- Pantalla remota de reproducción.
- Código QR.
- Búsqueda y biblioteca de canciones.
- Cola colaborativa.
- Cambio de tonalidad.
- Persistencia local de configuración y canciones.

La capa propia de sesiones múltiples, anfitriones, invitados y códigos de sesión todavía no ha sido implementada.

## Alcance funcional previsto para la primera versión

- Cuentas y autenticación únicamente para anfitriones.
- Invitados sin usuario ni contraseña.
- Ingreso de invitados mediante QR y nombre visible.
- Código público de sesión de seis caracteres.
- Una pantalla reproductora principal por sesión.
- Hasta tres sesiones simultáneas en la primera versión.
- Duración predeterminada de doce horas por sesión.
- Cola, participantes, controles y reproducción aislados por sesión.
- Dominio canónico previsto: `karaoke.gallarday.com`.
- Redirección futura desde:
  - `karaoke.smarthome.pe`
  - `karaoke.casainteligente.pe`

## Arquitectura prevista

```text
Navegadores de anfitriones e invitados
                  |
                  v
     Karaoke Propio Session Manager
      |            |             |
      v            v             v
   Sala 01      Sala 02       Sala 03
      |            |             |
      v            v             v
  Fire TV 1    Fire TV 2     Fire TV 3
```

Cada sala tendrá una cola, participantes, estado y reproductor independientes.

## Requisitos actuales

- Docker Engine
- Docker Compose
- Una red Docker externa denominada `nginx-proxy`
- Un navegador moderno
- Espacio local para canciones y datos persistentes

## Instalación local del prototipo

Clonar el repositorio:

```bash
git clone https://github.com/ATuManera/karaoke-propio.git
cd karaoke-propio
```

Crear la configuración local:

```bash
cp .env.example .env
```

Editar `.env` y establecer la URL del servidor:

```env
KARAOKE_PUBLIC_URL=http://IP_DEL_SERVIDOR:5555
```

Crear los directorios persistentes:

```bash
mkdir -p data songs backups
```

Comprobar si existe la red externa requerida:

```bash
docker network inspect nginx-proxy >/dev/null 2>&1   || docker network create nginx-proxy
```

Iniciar el contenedor:

```bash
docker compose up -d
```

Comprobar el estado:

```bash
docker compose ps
docker compose logs --tail=50
```

Interfaz principal:

```text
http://IP_DEL_SERVIDOR:5555
```

Pantalla de reproducción:

```text
http://IP_DEL_SERVIDOR:5555/splash
```

## Datos excluidos del repositorio

Este repositorio no incluye ni debe incluir:

- Canciones, videos o pistas de audio.
- Letras protegidas por derechos de autor.
- Bases de datos operativas.
- Copias de seguridad.
- Contraseñas, tokens o archivos `.env`.
- Certificados o claves privadas.

Los directorios `songs/`, `data/` y `backups/` se mantienen exclusivamente en cada instalación.

## Uso de contenido multimedia

Karaoke Propio no distribuye canciones, videos, letras ni pistas musicales.

Cada operador de una instalación es responsable de utilizar contenido que posea, haya adquirido legalmente o tenga autorización para reproducir.

## Dependencias de terceros

La versión inicial utiliza PiKaraoke como imagen Docker externa. El código fuente de PiKaraoke no se copia ni se republica dentro de este repositorio.

Las dependencias y componentes de terceros conservan sus propios derechos, avisos y condiciones. Consulta `THIRD_PARTY_NOTICES.md`.

## Proyecto y mantenimiento

- Organización: [A Tu Manera](https://github.com/ATuManera)
- Repositorio: [ATuManera/karaoke-propio](https://github.com/ATuManera/karaoke-propio)
- Mantenedor principal: [Fernando Gallarday](https://github.com/fgallarday)

Desarrollado y mantenido por:

**INNOVA A TU MANERA SOLUCIONES DIGITALES S.A.C.**

## Licencia

El código original desarrollado específicamente para Karaoke Propio se distribuye bajo la **Apache License 2.0**.

Consulta los archivos `LICENSE`, `NOTICE` y `THIRD_PARTY_NOTICES.md`.
