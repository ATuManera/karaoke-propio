# Karaoke Propio — cdg-worker
#
# Wraps the vendored CDGSharp library (MIT, see CDGSharp/LICENSE) in a thin
# HTTP service. Separate .NET runtime from pitch-worker/acquisition-worker
# (Node) — three different single-purpose containers, not one polyglot one.
#
# The build context is the REPOSITORY ROOT, not ./cdg-worker, so every COPY
# carries its directory; that is what lets the legal notices at the root ride
# inside the published image (see app/Dockerfile for the why).
#
# The SDK stage is pinned to $BUILDPLATFORM and runs native for every
# architecture published: `dotnet publish --no-self-contained` emits portable
# IL, and CDGSharp and SixLabors are managed code with no native components.
# Only the runtime stage is per-architecture.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:6.0 AS build

WORKDIR /src
COPY cdg-worker/CDGSharp/CDGSharp.fsproj CDGSharp/
COPY cdg-worker/CDGSharp.Worker/CDGSharp.Worker.fsproj CDGSharp.Worker/
RUN dotnet restore CDGSharp.Worker/CDGSharp.Worker.fsproj

COPY cdg-worker/CDGSharp/ CDGSharp/
COPY cdg-worker/CDGSharp.Worker/ CDGSharp.Worker/
RUN dotnet publish CDGSharp.Worker/CDGSharp.Worker.fsproj -c Release -o /app --no-self-contained

FROM mcr.microsoft.com/dotnet/runtime:6.0

# DejaVu Sans: the validated fix for rendering on Linux/Docker, where the
# CLI's original "Arial" default isn't installed (prompt_de_implementacion.md
# #36 point 2). fontconfig lets SixLabors.Fonts' SystemFonts discover it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig curl \
  && rm -rf /var/lib/apt/lists/*

# 1000:1000 is the image's default; docker-compose.yml overrides it at run
# time with `user: "${PUID:-1000}:${PGID:-1000}"`, because a published image
# cannot bake in the UID of whoever pulls it. This worker writes .cdg files
# into the shared library, so the UID has to be the host's.
ARG PUID=1000
ARG PGID=1000
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || groupadd -g "${PGID}" cdgworker) \
      && useradd -m -u "${PUID}" -g "${PGID}" cdgworker; \
    fi

WORKDIR /app
COPY --from=build /app .

# The notices travel inside the image. CDGSharp's own MIT licence goes in
# alongside the root ones: this image is the copy of it that gets distributed.
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /licenses/
COPY cdg-worker/CDGSharp/LICENSE /licenses/LICENSE.CDGSharp.MIT

# A writable $HOME for a UID with no passwd entry: .NET puts its bundle
# extraction and telemetry state under it and refuses to start otherwise.
ENV HOME=/tmp
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1

USER ${PUID}:${PGID}

ENV PORT=4200
EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD curl -sf "http://127.0.0.1:${PORT}/health" || exit 1

ARG KP_VERSION=dev
LABEL org.opencontainers.image.title="Karaoke Propio — CD+G worker"
LABEL org.opencontainers.image.description="CD+G generation from UltraStar files for Karaoke Propio (.NET, vendored CDGSharp). Internal service; not exposed."
LABEL org.opencontainers.image.source="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.url="https://github.com/ATuManera/karaoke-propio"
LABEL org.opencontainers.image.documentation="https://github.com/ATuManera/karaoke-propio/blob/main/README.md"
LABEL org.opencontainers.image.vendor="A Tu Manera"
LABEL org.opencontainers.image.version="${KP_VERSION}"
LABEL org.opencontainers.image.licenses="Apache-2.0"

ENTRYPOINT ["dotnet", "CDGSharp.Worker.dll"]
