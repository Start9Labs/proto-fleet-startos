import { SubContainer, utils } from '@start9labs/start-sdk'
import { manifest } from '../manifest'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { adminUsername, dbName, dbUser, pgPort } from '../utils'

export const fleetdDbEnv = (dbPassword: string) => ({
  DB_ADDRESS: `127.0.0.1:${pgPort}`,
  DB_NAME: dbName,
  DB_USERNAME: dbUser,
  DB_PASSWORD: dbPassword,
  DB_SSL_MODE: 'disable',
})

// Resets the sole super admin through fleetd's own break-glass command; fails
// when the database is not running.
export async function resetAdminPassword(
  sub: SubContainer<typeof manifest>,
  dbPassword: string,
  password: string,
) {
  return sub.exec(
    ['/app/fleetd', 'admin', 'reset-password', '--password-stdin'],
    {
      env: fleetdDbEnv(dbPassword),
      input: `${password}\n`,
    },
  )
}

export const setAdminPassword = sdk.Action.withoutInput(
  'set-admin-password',

  async ({ effects }) => ({
    name: i18n('Set Admin Password'),
    description: i18n(
      'Generate a new random password for the Proto Fleet super admin account. Replaces any existing password.',
    ),
    warning: (await storeJson.read((s) => s.adminPassword).const(effects))
      ? i18n(
          'Replaces the current admin password and signs out every session of the super admin.',
        )
      : null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const adminPassword = utils.getDefaultString({
      charset: 'a-z,A-Z,0-9',
      len: 32,
    })
    await storeJson.merge(effects, {
      adminPassword,
      adminPasswordApplied: false,
    })

    // While Proto Fleet runs, apply it now; otherwise the next start does.
    const dbPassword = (await storeJson.read((s) => s.dbPassword).once())!
    const { exitCode } = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'fleet' },
      null,
      'reset-admin-password',
      (sub) => resetAdminPassword(sub, dbPassword, adminPassword),
    )
    if (exitCode === 0) {
      await storeJson.merge(effects, { adminPasswordApplied: true })
    }

    return {
      version: '1',
      title: i18n('Proto Fleet Admin Credentials'),
      message:
        exitCode === 0
          ? i18n('Use these credentials to sign in to Proto Fleet.')
          : i18n(
              'Use these credentials to sign in to Proto Fleet. The password takes effect the next time Proto Fleet starts.',
            ),
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Username'),
            description: null,
            value: adminUsername,
            masked: false,
            copyable: true,
            qr: false,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('Password'),
            description: null,
            value: adminPassword,
            masked: true,
            copyable: true,
            qr: false,
            launchable: false,
          },
        ],
      },
    }
  },
)
