# Karaoke Propio — pitch-worker
#
# Debian bookworm (not the karaoke-eternal image's Alpine base) because its
# apt ffmpeg package includes the rubberband filter; already validated
# (ffmpeg 5.1.9 + `apt-get install ffmpeg rubberband-cli`) per
# prompt_de_implementacion.md #16. No Node dependencies: server.js only uses
# built-ins.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg rubberband-cli \
  && rm -rf /var/lib/apt/lists/*

# run as the same non-root UID/GID as the host's `fernando` user so files
# written into the shared pitch-cache volume are writable/readable outside
# the container without chmod 777
ARG PUID=1000
ARG PGID=1000
# node:*-bookworm-slim already ships a `node` user/group at 1000:1000; reuse
# it when PUID/PGID match (the common case), otherwise create pitchworker
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || groupadd -g "${PGID}" pitchworker) \
      && useradd -m -u "${PUID}" -g "${PGID}" pitchworker; \
    fi

WORKDIR /app
COPY package.json server.js ./

USER ${PUID}:${PGID}

ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
