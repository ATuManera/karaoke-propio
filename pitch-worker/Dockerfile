# Karaoke Propio — pitch-worker
#
# Debian bookworm (not the application image's Alpine base) because its apt
# ffmpeg package includes the rubberband filter; already validated
# (ffmpeg 5.1.9 + `apt-get install ffmpeg rubberband-cli`) per
# prompt_de_implementacion.md #16. No Node dependencies: server.js only uses
# built-ins.
#
# The build context is the REPOSITORY ROOT, not ./pitch-worker, so the COPY
# lines carry their directory. That is what lets the legal notices at the root
# ride inside the published image (see app/Dockerfile for the why).
#
# No --platform anywhere in this file, deliberately. This image is almost
# nothing but `apt-get install`, and those packages must be the target
# architecture's. Building the arm64 variant therefore runs under QEMU, which
# is fine: installing packages is I/O, not computation.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg rubberband-cli \
  && rm -rf /var/lib/apt/lists/*

# run as the same non-root UID/GID as the host user so files written into the
# shared pitch-cache volume are writable/readable outside the container
# without chmod 777.
#
# 1000:1000 is the image's default and docker-compose.yml overrides it at run
# time with `user: "${PUID:-1000}:${PGID:-1000}"` — a published image cannot
# bake in the UID of whoever pulls it.
ARG PUID=1000
ARG PGID=1000
# node:*-bookworm-slim already ships a `node` user/group at 1000:1000; reuse
# it when PUID/PGID match (the common case), otherwise create pitchworker
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || groupadd -g "${PGID}" pitchworker) \
      && useradd -m -u "${PUID}" -g "${PGID}" pitchworker; \
    fi

WORKDIR /app
COPY pitch-worker/package.json pitch-worker/server.js ./

# The notices travel inside the image: from 2.9.0 this image is published, and
# the ffmpeg and rubberband binaries in it are third-party GPL components
# whose terms THIRD_PARTY_NOTICES.md §11 spells out, source included.
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /licenses/

# A writable $HOME for a UID with no passwd entry (any PUID other than 1000).
# ffmpeg and rubberband both write scratch files relative to it.
ENV HOME=/tmp

USER ${PUID}:${PGID}

ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ARG KP_VERSION=dev
LABEL org.opencontainers.image.title="Karaoke Propio — pitch worker"
LABEL org.opencontainers.image.description="Pitch shifting and key detection for Karaoke Propio (ffmpeg + rubberband). Internal service; not exposed."
LABEL org.opencontainers.image.source="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.url="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.documentation="https://github.com/ATuManera/karaoke-propio/blob/main/README.md"
LABEL org.opencontainers.image.vendor="A Tu Manera"
LABEL org.opencontainers.image.version="${KP_VERSION}"
LABEL org.opencontainers.image.licenses="Apache-2.0"

CMD ["node", "server.js"]
