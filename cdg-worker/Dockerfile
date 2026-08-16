# Karaoke Propio — cdg-worker
#
# Wraps the vendored CDGSharp library (MIT, see CDGSharp/LICENSE) in a thin
# HTTP service. Separate .NET runtime from pitch-worker/acquisition-worker
# (Node) — three different single-purpose containers, not one polyglot one.
FROM mcr.microsoft.com/dotnet/sdk:6.0 AS build

WORKDIR /src
COPY CDGSharp/CDGSharp.fsproj CDGSharp/
COPY CDGSharp.Worker/CDGSharp.Worker.fsproj CDGSharp.Worker/
RUN dotnet restore CDGSharp.Worker/CDGSharp.Worker.fsproj

COPY CDGSharp/ CDGSharp/
COPY CDGSharp.Worker/ CDGSharp.Worker/
RUN dotnet publish CDGSharp.Worker/CDGSharp.Worker.fsproj -c Release -o /app --no-self-contained

FROM mcr.microsoft.com/dotnet/runtime:6.0

# DejaVu Sans: the validated fix for rendering on Linux/Docker, where the
# CLI's original "Arial" default isn't installed (prompt_de_implementacion.md
# #36 point 2). fontconfig lets SixLabors.Fonts' SystemFonts discover it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig curl \
  && rm -rf /var/lib/apt/lists/*

ARG PUID=1000
ARG PGID=1000
RUN if ! getent passwd "${PUID}" >/dev/null; then \
      (getent group "${PGID}" >/dev/null || groupadd -g "${PGID}" cdgworker) \
      && useradd -m -u "${PUID}" -g "${PGID}" cdgworker; \
    fi

WORKDIR /app
COPY --from=build /app .

USER ${PUID}:${PGID}

ENV PORT=4200
EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD curl -sf "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["dotnet", "CDGSharp.Worker.dll"]
