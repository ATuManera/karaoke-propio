# Karaoke Propio — acquisition-worker
#
# Debian bookworm (matches pitch-worker) + ffmpeg (yt-dlp needs it to mux
# separate video/audio streams) + yt-dlp via pip. No PiKaraoke/GPL code —
# server.js is our own thin wrapper around yt-dlp's documented CLI.
#
# The build context is the REPOSITORY ROOT, not ./acquisition-worker, so the
# COPY lines carry their directory; that is what lets the legal notices at the
# root ride inside the published image (see app/Dockerfile for the why).
#
# No --platform anywhere, deliberately: apt and pip must resolve against the
# target architecture, so the arm64 variant is built under QEMU. yt-dlp is
# pure Python and ffmpeg exists in bookworm for arm64, so nothing here is
# architecture-specific beyond the packages themselves.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3-pip \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && rm -rf /var/lib/apt/lists/* /root/.cache/pip

# 1000:1000 is the image's default; docker-compose.yml overrides it at run
# time with `user: "${PUID:-1000}:${PGID:-1000}"`. A published image cannot
# bake in the UID of whoever pulls it, and this worker writes into the song
# library, so the UID has to be the host's.
ARG PUID=1000
ARG PGID=1000
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || groupadd -g "${PGID}" acqworker) \
      && useradd -m -u "${PUID}" -g "${PGID}" acqworker; \
    fi

WORKDIR /app
COPY acquisition-worker/package.json acquisition-worker/server.js ./

# The notices travel inside the image: from 2.9.0 it is published, and the
# ffmpeg binaries in it are third-party GPL components whose terms and source
# THIRD_PARTY_NOTICES.md §11 points at.
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /licenses/

# yt-dlp is the reason this is not optional. It writes a cache under $HOME,
# and under a PUID with no passwd entry $HOME resolves to `/`, which is not
# writable: downloads then fail with a permission error that says nothing
# about the UID that caused it.
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache

USER ${PUID}:${PGID}

ENV PORT=4100
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ARG KP_VERSION=dev
LABEL org.opencontainers.image.title="Karaoke Propio — acquisition worker"
LABEL org.opencontainers.image.description="YouTube and UltraStar song acquisition for Karaoke Propio (yt-dlp + ffmpeg). Internal service; not exposed."
LABEL org.opencontainers.image.source="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.url="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.documentation="https://github.com/ATuManera/karaoke-propio/blob/main/README.md"
LABEL org.opencontainers.image.vendor="A Tu Manera"
LABEL org.opencontainers.image.version="${KP_VERSION}"
LABEL org.opencontainers.image.licenses="Apache-2.0"

CMD ["node", "server.js"]
