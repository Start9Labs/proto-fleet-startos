# Updating the upstream version

Upstream is [block/proto-fleet](https://github.com/block/proto-fleet). It publishes no container images, so the package builds two:

- `fleet` (`Dockerfile`) downloads the release's prebuilt server binaries and client build, verified by sha256, and copies upstream's nginx config and host profiles from the `proto-fleet` submodule.
- `timescaledb` builds upstream's own `server/timescaledb/Dockerfile` from the submodule.

## Determining the upstream version

```bash
gh release view -R block/proto-fleet --json tagName -q .tagName
```

Skip the `nightly-*` and `-rc.*` tags, which are prereleases.

## Applying the bump

1. Move the submodule to the new tag:

   ```bash
   git -C proto-fleet fetch --tags && git -C proto-fleet checkout <tag>
   ```

2. In `Dockerfile`, set `PROTO_FLEET_VERSION` to the tag and replace the three checksums with the new release assets':

   ```bash
   for a in proto-fleet-server-<tag>-amd64.tar.gz proto-fleet-server-<tag>-arm64.tar.gz proto-fleet-client-<tag>.tar.gz; do
     curl -sL "https://github.com/block/proto-fleet/releases/download/<tag>/$a" | sha256sum
   done
   ```

3. Diff upstream's deployment between the two tags and carry anything that changed into the package:

   ```bash
   git -C proto-fleet diff <old-tag> <tag> -- deployment-files/docker-compose.yaml server/docker-compose.base.yaml deployment-files/server/Dockerfile deployment-files/client
   ```

   - fleetd environment variables and their values → `startos/main.ts`
   - postgres command-line flags, and the defaults of keys a profile can override → `postgresArgs` and `profileDefaults` in `startos/utils.ts`
   - files the server image ships (plugins, configs) → `Dockerfile`

4. Set `startos/versions/current.ts` to the tag without its `v`, at downstream revision `0`.
