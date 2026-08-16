# Karaoke Propio — acquisition-worker
#
# Debian bookworm (matches pitch-worker) + ffmpeg (yt-dlp needs it to mux
# separate video/audio streams) + yt-dlp via pip. No PiKaraoke/GPL code —
# server.js is our own thin wrapper around yt-dlp's documented CLI.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3-pip \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && rm -rf /var/lib/apt/lists/* /root/.cache/pip

ARG PUID=1000
ARG PGID=1000
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || groupadd -g "${PGID}" acqworker) \
      && useradd -m -u "${PUID}" -g "${PGID}" acqworker; \
    fi

WORKDIR /app
COPY package.json server.js ./

USER ${PUID}:${PGID}

ENV PORT=4100
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
