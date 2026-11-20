import { fleetdDbEnv, resetAdminPassword } from './actions/setAdminPassword'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  adminUsername,
  apiPort,
  dbName,
  dbUser,
  parseEnvFile,
  pgMount,
  pgdataPath,
  postgresArgs,
  profileDefaults,
  uiPort,
} from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Proto Fleet!'))

  const { dbPassword, authSecretKey, encryptMasterKey, profile } =
    (await storeJson
      .read((s) => ({
        dbPassword: s.dbPassword,
        authSecretKey: s.authSecretKey,
        encryptMasterKey: s.encryptMasterKey,
        profile: s.profile,
      }))
      .const(effects))!

  const fleetMounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: 'firmware',
      mountpoint: '/app/firmware',
      readonly: false,
    })
    .mountVolume({
      volumeId: 'main',
      subpath: 'command-artifacts',
      mountpoint: '/app/command-artifacts',
      readonly: false,
    })
    .mountVolume({
      volumeId: 'main',
      subpath: 'logs',
      mountpoint: '/app/logs',
      readonly: false,
    })
  const fleetSub = sdk.SubContainer.of(
    effects,
    { imageId: 'fleet' },
    fleetMounts,
    'fleetd',
  )
  const dbSub = sdk.SubContainer.of(
    effects,
    { imageId: 'timescaledb' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'db',
      subpath: null,
      mountpoint: pgMount,
      readonly: false,
    }),
    'timescaledb',
  )

  const tuning = {
    ...profileDefaults,
    ...parseEnvFile(
      (
        await fleetSub.execFail(['cat', `/app/profiles/${profile}.env`])
      ).stdout.toString(),
    ),
  }

  const api = (procedure: string, body: object) =>
    fetch(`http://[::1]:${apiPort}/${procedure}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`${procedure}: ${await res.text()}`)
      return res.json()
    })

  return (
    sdk.Daemons.of(effects)
      .addDaemon('timescaledb', {
        subcontainer: dbSub,
        exec: {
          command: [
            'docker-entrypoint.sh',
            'postgres',
            ...postgresArgs(tuning),
          ],
          env: {
            PGDATA: `${pgMount}${pgdataPath}`,
            POSTGRES_DB: dbName,
            POSTGRES_USER: dbUser,
            POSTGRES_PASSWORD: dbPassword,
            NO_TS_TUNE: '1',
          },
          sigtermTimeout: 60_000,
        },
        ready: {
          display: i18n('Database'),
          gracePeriod: 60_000,
          fn: async () =>
            (
              await dbSub.exec(
                ['pg_isready', '-h', '127.0.0.1', '-U', dbUser, '-d', dbName],
                { user: 'postgres' },
              )
            ).exitCode === 0
              ? { result: 'success', message: i18n('The database is ready') }
              : {
                  result: 'starting',
                  message: i18n('Waiting for the database to be ready'),
                },
        },
        requires: [],
      })
      .addOneshot('update-extensions', {
        subcontainer: dbSub,
        exec: {
          command: [
            'sh',
            '-c',
            `for ext in timescaledb timescaledb_toolkit; do
             if [ "$(psql -XtA -U ${dbUser} -d ${dbName} -c "SELECT 1 FROM pg_extension WHERE extname='$ext'")" = 1 ]; then
               psql -X -v ON_ERROR_STOP=1 -U ${dbUser} -d ${dbName} -c "ALTER EXTENSION $ext UPDATE"
             fi
           done`,
          ],
          user: 'postgres',
        },
        requires: ['timescaledb'],
      })
      .addDaemon('fleetd', {
        subcontainer: fleetSub,
        exec: {
          command: ['/app/fleetd'],
          env: {
            ...fleetdDbEnv(dbPassword),
            // Upstream's nginx.conf proxies to localhost, which resolves to ::1 first.
            HTTP_LISTEN_ADDRESS: `[::1]:${apiPort}`,
            HTTP_TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
            AUTH_CLIENT_SECRET_KEY: authSecretKey,
            AUTH_CLIENT_EXPIRATION_PERIOD: '24h',
            ENCRYPT_SERVICE_MASTER_KEY: encryptMasterKey,
            // Tor serves the UI over plain HTTP, where a Secure cookie is dropped.
            SESSION_COOKIE_SECURE: 'false',
            LOG_LEVEL: 'INFO',
            UPDATES_ENABLED: 'false',
            MARKET_DATA_ENABLED: 'false',
            PLUGINS_DIR: '/app/plugins',
            PLUGINS_ENABLED: 'true',
            ENABLE_VIRTUAL_MINERS: 'false',
            FLEET_COMMAND_MASTER_POLLING_INTERVAL: '1s',
            FLEET_COMMAND_WORKER_EXECUTION_TIMEOUT: '30s',
            FLEET_COMMAND_BATCH_STATUS_UPDATE_POLLING_INTERVAL: '1s',
            FLEET_QUEUE_DEQUE_LIMIT: '500',
            FLEET_QUEUE_MAX_FAILURE_RETRIES: '5',
            DB_MAX_OPEN_CONNS: tuning.DB_MAX_OPEN_CONNS,
            DB_MAX_IDLE_CONNS: tuning.DB_MAX_IDLE_CONNS,
            TELEMETRY_FETCH_INTERVAL: tuning.TELEMETRY_FETCH_INTERVAL,
            TELEMETRY_STALENESS_THRESHOLD: tuning.TELEMETRY_STALENESS_THRESHOLD,
            TELEMETRY_CONCURRENCY_LIMIT: tuning.TELEMETRY_CONCURRENCY_LIMIT,
            TELEMETRY_METRIC_TIMEOUT: tuning.TELEMETRY_METRIC_TIMEOUT,
            TIMESCALEDB_QUERY_TIMEOUT: tuning.TIMESCALEDB_QUERY_TIMEOUT,
            TIMESCALEDB_MAX_TIME_SERIES_ROWS:
              tuning.TIMESCALEDB_MAX_TIME_SERIES_ROWS,
            TIMESCALEDB_ASYNC_METRIC_COMMIT:
              tuning.TIMESCALEDB_ASYNC_METRIC_COMMIT,
            FLEET_COMMAND_MAX_WORKERS: tuning.FLEET_COMMAND_MAX_WORKERS,
          },
        },
        ready: {
          display: i18n('Fleet Server'),
          gracePeriod: 180_000,
          fn: () =>
            sdk.healthCheck.checkWebUrl(
              effects,
              `http://[::1]:${apiPort}/health`,
              {
                successMessage: i18n('The fleet server is ready'),
                errorMessage: i18n('The fleet server is not ready'),
              },
            ),
        },
        requires: ['update-extensions'],
      })
      // The web UI stays unreachable until the super admin exists, so nobody can
      // claim the instance through upstream's onboarding page.
      .addOneshot('admin-account', {
        subcontainer: fleetSub,
        exec: {
          fn: async (sub) => {
            const { adminPassword, adminPasswordApplied } = (await storeJson
              .read()
              .once())!
            if (!adminPassword) throw new Error('No admin password is set')
            const init = await api(
              'onboarding.v1.OnboardingService/GetFleetInitStatus',
              {},
            )
            if (!init.status?.adminCreated) {
              await api('onboarding.v1.OnboardingService/CreateAdminLogin', {
                username: adminUsername,
                password: adminPassword,
              })
            } else if (!adminPasswordApplied) {
              const res = await resetAdminPassword(
                sub,
                dbPassword,
                adminPassword,
              )
              if (res.exitCode !== 0) {
                throw new Error(
                  `Admin password reset failed: ${res.stderr.toString()}`,
                )
              }
            }
            await storeJson.merge(effects, { adminPasswordApplied: true })
            return null
          },
        },
        requires: ['fleetd'],
      })
      .addDaemon('nginx', {
        subcontainer: sdk.SubContainer.of(
          effects,
          { imageId: 'fleet' },
          null,
          'nginx',
        ),
        exec: { command: ['nginx', '-g', 'daemon off;'] },
        ready: {
          display: i18n('Web Interface'),
          fn: () =>
            sdk.healthCheck.checkPortListening(effects, uiPort, {
              successMessage: i18n('The web interface is ready'),
              errorMessage: i18n('The web interface is not ready'),
            }),
        },
        requires: ['admin-account'],
      })
  )
})
