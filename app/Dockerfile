# Karaoke Propio — the application
#
# Multi-stage build of the Karaoke Propio server + client (the vendored
# Karaoke Eternal base, extended). Deliberately Alpine (matches the upstream
# radrootllc/karaoke-eternal image this fork replaces) — it does NOT have
# FFmpeg's rubberband filter, which is exactly why pitch shifting runs in the
# separate `pitch-worker` service instead of here (see
# prompt_de_implementacion.md #16).
#
# The build context is the REPOSITORY ROOT, not ./app, so every COPY here is
# prefixed with the directory it comes from. That is not a preference: the
# ISC licence of the vendored base asks for its copyright notice to appear in
# all copies, and from 2.9.0 the copy people receive is a published image
# rather than a checkout. LICENSE, NOTICE and THIRD_PARTY_NOTICES.md live at
# the root and were unreachable from a ./app context. The root
# .dockerignore is what keeps the 19 GB library out of that wider context.
#
# The two stages that compile are pinned to $BUILDPLATFORM — they run native
# on whichever machine builds, for every architecture published. That is
# sound here and was checked, not assumed: all 22 production dependencies are
# pure JavaScript (no node-gyp, no .node addons; the fork uses Node's own
# SQLite and bcryptjs), and webpack output is bytecode-free JavaScript. Only
# the final stage is per-architecture, so an arm64 image costs no emulation.

FROM --platform=$BUILDPLATFORM node:24-alpine AS build

WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY app/ ./
RUN npm run build:server && npm run build:client

# Production dependencies, installed clean rather than pruned out of the build
# stage's tree. `npm ci --omit=dev` from the same lockfile is reproducible and
# leaves nothing behind that a prune had to find; it also runs once, native,
# and is copied into both architectures.
FROM --platform=$BUILDPLATFORM node:24-alpine AS deps

WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# The runtime image. No --platform: this one inherits $TARGETPLATFORM and is
# built once per architecture in the manifest list.
FROM node:24-alpine

# Alpine ships without the timezone database, so TZ is silently ignored and
# everything runs in UTC — timestamps in logs looked hours off from Lima.
RUN apk add --no-cache tzdata

# run as a fixed, non-root UID/GID matching the other Karaoke Propio
# services (pitch-worker, acquisition-worker) so files under bind-mounted
# volumes (library, config) stay consistently owned — see
# prompt_de_implementacion.md #45.
#
# 1000:1000 is baked in as the default and docker-compose.yml overrides it at
# run time with `user: "${PUID:-1000}:${PGID:-1000}"`. A published image
# cannot bake in anybody's UID: whoever pulls it would get this machine's.
# Docker accepts a UID that has no entry in the image's /etc/passwd, and Node
# does not need one.
ARG PUID=1000
ARG PGID=1000
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || addgroup -g "${PGID}" keserver) \
      && adduser -D -H -u "${PUID}" -G "$(getent group "${PGID}" | cut -d: -f1)" keserver; \
    fi

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/assets ./assets

# The notices travel inside the image. Both licences belong in this one: the
# ISC covers the vendored Karaoke Eternal source under app/, the Apache 2.0 at
# the root covers this project's own work.
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /licenses/
COPY app/LICENSE /licenses/LICENSE.karaoke-eternal.ISC

# A writable $HOME for a UID that may not exist in /etc/passwd. Run with
# PUID=1001 there is no passwd entry, HOME resolves to `/`, and anything that
# tries to write beside it — a library's cache, a crash log — fails on a
# read-only path for reasons that read as unrelated.
ENV HOME=/tmp

RUN mkdir -p /config && chown -R "${PUID}:${PGID}" /config /app

USER ${PUID}:${PGID}

ENV NODE_ENV=production
ENV KES_PATH_DATA=/config
ENV KES_PORT=8080

EXPOSE 8080
VOLUME ["/config"]

# What this image is, for anyone who pulls it. image.source is also what makes
# GHCR link the package to the repository without any further configuration.
ARG KP_VERSION=dev
LABEL org.opencontainers.image.title="Karaoke Propio"
LABEL org.opencontainers.image.description="Self-hosted karaoke for home events: library, queue, player, phone remote, per-singer pitch, YouTube and UltraStar acquisition."
LABEL org.opencontainers.image.source="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.url="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.documentation="https://github.com/ATuManera/karaoke-propio/blob/main/README.md"
LABEL org.opencontainers.image.vendor="A Tu Manera"
LABEL org.opencontainers.image.version="${KP_VERSION}"
LABEL org.opencontainers.image.licenses="Apache-2.0"

CMD ["node", "build/server/main.js"]
