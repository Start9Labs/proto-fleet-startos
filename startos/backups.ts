import { backup, SubContainer } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { manifest } from './manifest'
import { sdk } from './sdk'
import { dbName, dbUser, pgdataPath, pgMount } from './utils'

const pgdata = `${pgMount}${pgdataPath}`
const dumpFile = `/backup-target/${dbName}-db.dump`
// Dumps are staged off the backup FUSE mount, which silently drops pg_dump's writes.
const tmpDump = `/tmp/${dbName}-db.dump`

const dbMounts = () =>
  sdk.Mounts.of().mountVolume({
    volumeId: 'db',
    subpath: null,
    mountpoint: pgMount,
    readonly: false,
  })

async function withPostgres(
  effects: Parameters<typeof SubContainer.withTemp>[0],
  name: string,
  fn: (
    sub: SubContainer<typeof manifest>,
    psql: (sql: string) => Promise<unknown>,
  ) => Promise<void>,
  init?: (sub: SubContainer<typeof manifest>) => Promise<void>,
) {
  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'timescaledb' },
    dbMounts(),
    name,
    async (sub) => {
      await backup.mountBackupTarget(sub.rootfs)
      await sub.execFail(['mkdir', '-p', '/var/run/postgresql'])
      await sub.execFail(
        ['chown', '-R', 'postgres:postgres', pgMount, '/var/run/postgresql'],
        {
          timeout: null,
        },
      )
      await init?.(sub)
      await sub.exec(['rm', '-f', `${pgdata}/postmaster.pid`], {
        user: 'postgres',
      })
      await sub.execFail(
        [
          'pg_ctl',
          'start',
          '-w',
          '-t',
          '120',
          '-D',
          pgdata,
          '-o',
          '-c listen_addresses= -c shared_preload_libraries=timescaledb,pg_stat_statements',
        ],
        { user: 'postgres', timeout: null },
      )
      await fn(sub, (sql) =>
        sub.execFail(
          [
            'psql',
            '-X',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            dbUser,
            '-d',
            dbName,
            '-c',
            sql,
          ],
          {
            user: 'postgres',
            timeout: null,
          },
        ),
      )
      await sub.execFail(['pg_ctl', 'stop', '-w', '-t', '120', '-D', pgdata], {
        user: 'postgres',
        timeout: null,
      })
    },
  )
}

export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.ofVolumes('main')
    .setOptions({ exclude: ['logs'] })
    .setPreBackup(async (effects) =>
      withPostgres(effects, 'pg-dump', async (sub) => {
        await sub.execFail(
          ['pg_dump', '-U', dbUser, '-Fc', '-f', tmpDump, dbName],
          {
            user: 'postgres',
            timeout: null,
          },
        )
        await sub.execFail(['cp', tmpDump, dumpFile], { timeout: null })
      }),
    )
    // TimescaleDB restores only between timescaledb_pre_restore() and
    // timescaledb_post_restore(), which the SDK's withPgDump cannot run.
    .setPostRestore(async (effects) => {
      const dbPassword = (await storeJson.read((s) => s.dbPassword).once())!
      await withPostgres(
        effects,
        'pg-restore',
        async (sub, psql) => {
          await sub.execFail(['createdb', '-U', dbUser, dbName], {
            user: 'postgres',
          })
          await psql('CREATE EXTENSION IF NOT EXISTS timescaledb')
          await psql('SELECT timescaledb_pre_restore()')
          await sub.execFail(['cp', dumpFile, tmpDump], { timeout: null })
          await sub.execFail(['chown', 'postgres:postgres', tmpDump])
          // Keep privileges: fleetd refuses a schema whose function ACLs differ.
          await sub.execFail(
            ['pg_restore', '-U', dbUser, '-d', dbName, '--no-owner', tmpDump],
            { user: 'postgres', timeout: null },
          )
          await psql('SELECT timescaledb_post_restore()')
        },
        async (sub) => {
          await sub.execFail(
            [
              'sh',
              '-c',
              `printf '%s' "$PW" > /tmp/pwfile && chown postgres /tmp/pwfile`,
            ],
            {
              env: { PW: dbPassword },
            },
          )
          await sub.execFail(
            [
              'initdb',
              '-D',
              pgdata,
              '-U',
              dbUser,
              '--pwfile=/tmp/pwfile',
              '--auth-host=scram-sha-256',
              '--auth-local=trust',
            ],
            { user: 'postgres', timeout: null },
          )
        },
      )
    }),
)
