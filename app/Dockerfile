# Karaoke Propio — karaoke-eternal (fork)
#
# Multi-stage build of the Karaoke Eternal server + client. Deliberately
# Alpine (matches the upstream radrootllc/karaoke-eternal image this fork
# replaces) — it does NOT have FFmpeg's rubberband filter, which is exactly
# why pitch shifting runs in the separate `pitch-worker` service instead of
# here (see prompt_de_implementacion.md #16).
FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build:server && npm run build:client

# prune devDependencies out of node_modules for the runtime image
RUN npm prune --omit=dev

FROM node:24-alpine

# Alpine ships without the timezone database, so TZ is silently ignored and
# everything runs in UTC — timestamps in logs looked hours off from Lima.
RUN apk add --no-cache tzdata

# run as a fixed, non-root UID/GID matching the other Karaoke Propio
# services (pitch-worker, acquisition-worker) so files under bind-mounted
# volumes (library, config) stay consistently owned — see
# prompt_de_implementacion.md #45
ARG PUID=1000
ARG PGID=1000
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || addgroup -g "${PGID}" keserver) \
      && adduser -D -H -u "${PUID}" -G "$(getent group "${PGID}" | cut -d: -f1)" keserver; \
    fi

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/assets ./assets

RUN mkdir -p /config && chown -R "${PUID}:${PGID}" /config /app

USER ${PUID}:${PGID}

ENV NODE_ENV=production
ENV KES_PATH_DATA=/config
ENV KES_PORT=8080

EXPOSE 8080
VOLUME ["/config"]

CMD ["node", "build/server/main.js"]
