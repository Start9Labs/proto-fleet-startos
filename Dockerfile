# Proto Fleet API server and web client in one image.
#
# Upstream publishes no container images: its release ships prebuilt per-arch
# server binaries and a static client build, and its own deployment wraps them
# in alpine+gcompat (deployment-files/server/Dockerfile) and nginx
# (deployment-files/client/Dockerfile). This reproduces both on one nginx base.
# The release assets are pinned by sha256 and must match the proto-fleet
# submodule's tag; see UPDATING.md.

ARG PROTO_FLEET_VERSION=v0.6.0

FROM nginx:1.29.0-alpine AS fetch
ARG PROTO_FLEET_VERSION
ARG TARGETARCH
ARG SERVER_SHA256_AMD64=aec809d19b5026735e94d59bebbbbec33273caacf8791ef11e13b3801a47afb5
ARG SERVER_SHA256_ARM64=3b2d94a2c81478d46ffeb350d1fea2750880f06e7548d1eed3f02fa8d6a5d643
ARG CLIENT_SHA256=5d83b6ea8a243ce5ec6f5047dad4aae0a644600a066e7f65beebee3442324319

WORKDIR /fetch
RUN set -eux; \
    base="https://github.com/block/proto-fleet/releases/download/${PROTO_FLEET_VERSION}"; \
    case "${TARGETARCH}" in \
      amd64) sha="${SERVER_SHA256_AMD64}" ;; \
      arm64) sha="${SERVER_SHA256_ARM64}" ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    wget -q -O server.tar.gz "${base}/proto-fleet-server-${PROTO_FLEET_VERSION}-${TARGETARCH}.tar.gz"; \
    echo "${sha}  server.tar.gz" | sha256sum -c -; \
    wget -q -O client.tar.gz "${base}/proto-fleet-client-${PROTO_FLEET_VERSION}.tar.gz"; \
    echo "${CLIENT_SHA256}  client.tar.gz" | sha256sum -c -; \
    mkdir server client; \
    tar -xzf server.tar.gz -C server; \
    tar -xzf client.tar.gz -C client; \
    for bin in fleetd proto-plugin antminer-plugin asicrs-plugin; do \
      mv "server/${bin}-${TARGETARCH}" "server/${bin}"; \
    done

FROM nginx:1.29.0-alpine
ARG PROTO_FLEET_VERSION

# fleetd is dynamically linked against glibc.
RUN apk add --no-cache gcompat

WORKDIR /app
COPY --from=fetch /fetch/server/fleetd /app/fleetd
COPY --from=fetch /fetch/server/proto-plugin /fetch/server/antminer-plugin /fetch/server/asicrs-plugin /fetch/server/asicrs-config.yaml /app/plugins/
COPY proto-fleet/deployment-files/profiles /app/profiles
RUN chmod 755 /app/fleetd /app/plugins/*-plugin \
    && mkdir -p /app/firmware /app/command-artifacts /app/logs

# The client build, and upstream's own nginx config for it (it proxies
# /api-proxy/ to fleetd on localhost:4000).
RUN rm -rf /usr/share/nginx/html && rm -f /etc/nginx/conf.d/*.conf
COPY --from=fetch /fetch/client/dist/protoFleet /usr/share/nginx/html
COPY proto-fleet/deployment-files/client/nginx.http.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
