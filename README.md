<p align="center">
  <img src="icon.svg" alt="Proto Fleet Logo" width="21%">
</p>

# Proto Fleet on StartOS

> Everything not listed in this document should behave the same as upstream
> Proto Fleet. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

[Proto Fleet](https://github.com/block/proto-fleet) is open-source fleet management for bitcoin miners: it discovers and pairs ASICs on the local network, records their telemetry in TimescaleDB, and controls them (reboot, pause, pools, power modes, firmware) from a web dashboard.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

Upstream publishes no container images, only release assets and an install script that builds images locally, so both images are built by the package.

| Image         | Source                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet`       | `nginx` on Alpine with `gcompat`, plus upstream's prebuilt `fleetd` and miner plugins (proto, antminer, asic-rs) and its static web client, from the GitHub release |
| `timescaledb` | Upstream's own `server/timescaledb/Dockerfile` (PostgreSQL, TimescaleDB, timescaledb_toolkit), built from the `proto-fleet` submodule                               |

Architectures: x86_64, aarch64.

Subcontainers, in start order:

| Subcontainer  | Runs                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `timescaledb` | PostgreSQL through upstream's entrypoint, bound to `127.0.0.1:5432`                                     |
| `fleetd`      | the Proto Fleet API server on `[::1]:4000`, loopback only; the miner plugins run as its child processes |
| `nginx`       | upstream's client nginx config: serves the web client on port 80 and proxies `/api-proxy/` to fleetd    |

A oneshot (`update-extensions`) runs `ALTER EXTENSION … UPDATE` for `timescaledb` and `timescaledb_toolkit` on every start, before fleetd, so a rebuilt database image with a newer TimescaleDB brings the existing database up to it. A second oneshot (`admin-account`) runs after fleetd is healthy; see [Installation and First-Run Flow](#installation-and-first-run-flow).

## Volume and Data Layout

Two volumes: one for the database, one for everything else.

| Volume | Mount point                             | Contents                                                                                                             |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `db`   | `/home/postgres/pgdata` (`timescaledb`) | the PostgreSQL cluster, PGDATA at `data/`: users, paired miners and their encrypted credentials, telemetry, activity |
| `main` | subpaths mounted into `fleetd`          | `store.json`; `firmware/` → `/app/firmware`; `command-artifacts/` → `/app/command-artifacts`; `logs/` → `/app/logs`  |

## File Models

The package writes no Proto Fleet configuration file. fleetd is configured entirely by environment variables, set on every start, so nothing can be edited by hand.

`store.json` (on `main`) holds StartOS-side state:

| Key                                 | Seeded                                | Changed by                                                                                        |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `dbPassword`                        | at install                            | nothing                                                                                           |
| `authSecretKey`, `encryptMasterKey` | at install, 32 random bytes as base64 | nothing. `encryptMasterKey` encrypts stored miner credentials: losing it makes them undecryptable |
| `adminPassword`                     | unset                                 | **Set Admin Password**                                                                            |
| `adminPasswordApplied`              | `false`                               | **Set Admin Password** (`false`, then `true` once applied); the `admin-account` oneshot (`true`)  |
| `profile`                           | `mini`                                | **Performance Profile**                                                                           |

Environment re-asserted on every start includes `UPDATES_ENABLED=false`, `MARKET_DATA_ENABLED=false`, `ENABLE_VIRTUAL_MINERS=false`, `SESSION_COOKIE_SECURE=false` and `HTTP_TRUSTED_PROXY_CIDRS` set to loopback. The selected profile is read from upstream's own `deployment-files/profiles/<profile>.env` (shipped in the `fleet` image at `/app/profiles/`) over upstream's compose defaults. It supplies fleetd's pool, polling and query limits and the PostgreSQL `-c` flags (`shared_buffers`, `max_connections`, `work_mem` and the rest). `timescaledb-tune` is disabled, so the profile alone sizes PostgreSQL.

## Dependencies

None.

## Network Access and Interfaces

One interface. fleetd and PostgreSQL listen on loopback only.

| Interface | Type | Port | Protocol | Purpose                                        |
| --------- | ---- | ---- | -------- | ---------------------------------------------- |
| `ui`      | `ui` | 80   | HTTP     | web dashboard, and the API under `/api-proxy/` |

Outbound, fleetd opens TCP connections to miners on the LAN for discovery, polling and control, from the service container's address. The container is on a StartOS-internal network (`10.0.3.0/24`), so Proto Fleet's own network detection reports that subnet rather than the LAN, and mDNS discovery cannot reach the LAN. Discovery by IP list, IP range or subnet scan works.

## Installation and First-Run Flow

Upstream opens on an onboarding page where the first visitor creates the super admin. On StartOS that page is never reachable unclaimed:

1. Install raises a critical **Set Admin Password** task, which blocks starting until it is run.
2. On start, the `admin-account` oneshot waits for fleetd, then calls `onboarding.v1.OnboardingService/CreateAdminLogin` over loopback with username `admin` and the stored password.
3. Only then does the `nginx` daemon start, so the web UI first appears with the admin already created and the onboarding page reports the fleet as onboarded.

The user signs in as `admin` and goes straight to adding miners.

## Actions

Two user-facing actions.

**Set Admin Password** (`set-admin-password`). Run it to recover a lost admin password, or to answer the install task. It generates a 32-character password and stores it. If PostgreSQL is running, it applies the password at once with `fleetd admin reset-password --password-stdin`, upstream's break-glass command for the sole super admin, which also revokes that account's sessions. If PostgreSQL is not running, the `admin-account` oneshot applies it at the next start. Takes seconds, never restarts the service, and is safe to repeat. The result shows username `admin` and the password. It resets the super admin whatever its current username, so if the user renamed the account in Proto Fleet, the displayed username is stale.

**Performance Profile** (`set-profile`). Run it when the fleet outgrows the `mini` defaults (about 200 miners) and the server has the memory: `standard` sets `shared_buffers` to 4 GB, `max` to 8 GB. It writes `profile` to `store.json`, which restarts the service with the new tuning. Safe to repeat.

## Tasks

One task.

| Task                 | Severity | Raised when                         | Cleared by                                                    |
| -------------------- | -------- | ----------------------------------- | ------------------------------------------------------------- |
| `set-admin-password` | critical | `store.json` has no `adminPassword` | running **Set Admin Password**; it does not return afterwards |

## Health Checks

Three checks, one per daemon.

| Check         | Probes                         | Grace period | A failure means                                                                                                                      |
| ------------- | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `timescaledb` | `pg_isready` on `127.0.0.1`    | 60 s         | PostgreSQL is not accepting connections: still in crash recovery after an unclean stop, or failing to start (read its logs)          |
| `fleetd`      | `GET http://[::1]:4000/health` | 180 s        | fleetd exited or is still running migrations. A crash loop shows `level=ERROR` lines in the logs, and fleetd restarts on its own     |
| `nginx`       | port 80 listening              | default      | nginx failed to start. It starts only after the `admin-account` oneshot succeeds, so a stuck start often traces back to that oneshot |

An `admin-account` failure (logged as `Admin password reset failed` or a `CreateAdminLogin` error) keeps the web UI down. Re-running **Set Admin Password** and restarting retries it.

## Backups and Restore

The database is **dumped**, not copied: PostgreSQL data files are not portable across CPU architectures, and a backup may be restored on either.

- **Backup:** a pre-backup hook starts PostgreSQL in a temporary container against the stopped `db` volume and writes `pg_dump -Fc` of the `fleet` database to the backup as `fleet-db.dump`. The `db` volume itself is not copied.
- **`main`** is copied, minus `logs/`. That carries `store.json` (including the master key that decrypts stored miner credentials), uploaded firmware and command artifacts.
- **Restore:** after `main` returns, a post-restore hook runs `initdb` on an empty `db` volume with the stored database password, creates `fleet`, then restores the dump between `timescaledb_pre_restore()` and `timescaledb_post_restore()`. The SDK's generic `withPgDump` can't run those two calls, so the hooks are written out in `startos/backups.ts`.

A restored instance needs nothing re-entered: the admin password, paired miners and their credentials come back as they were.

## Limitations and Differences

1. The in-app update prompt and GitHub release checks are disabled (`UPDATES_ENABLED=false`); updates come through StartOS.
2. mDNS discovery and Proto Fleet's automatic network detection don't see the LAN; miners are found by IP list, range or subnet.
3. Not shipped: upstream's beta alerts stack (a Grafana sidecar), the market-data panel (third-party price and mempool APIs), virtual miners, and Datadog browser monitoring.
4. Fleet Node (upstream's remote-site discovery agent, which connects back over gRPC) has not been tested through the StartOS proxy.
5. Session cookies are not marked `Secure`, so login works over plain-HTTP addresses such as Tor.

---

## Quick Reference for AI Consumers

```yaml
package_id: proto-fleet
image: built from block/proto-fleet release assets and its server/timescaledb Dockerfile
architectures: [x86_64, aarch64]
subcontainers: [timescaledb, fleetd, nginx]
volumes:
  db: /home/postgres/pgdata
  main: store.json; firmware, command-artifacts, logs mounted under /app
file_models:
  - main/store.json
startos_managed_env_vars:
  - DB_PASSWORD
  - AUTH_CLIENT_SECRET_KEY
  - ENCRYPT_SERVICE_MASTER_KEY
  - HTTP_LISTEN_ADDRESS
  - HTTP_TRUSTED_PROXY_CIDRS
  - SESSION_COOKIE_SECURE
  - UPDATES_ENABLED
  - MARKET_DATA_ENABLED
  - ENABLE_VIRTUAL_MINERS
dependencies: none
interfaces:
  ui: { type: ui, port: 80 }
actions:
  - set-admin-password
  - set-profile
tasks:
  - { action: set-admin-password, severity: critical }
health_checks:
  - timescaledb
  - fleetd
  - nginx
```
