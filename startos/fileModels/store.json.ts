import { FileHelper, utils, z } from '@start9labs/start-sdk'
import { randomBytes } from 'node:crypto'
import { sdk } from '../sdk'
import { profiles } from '../utils'

// fleetd decodes its keys as standard base64 of exactly 32 bytes.
const key = () => z.string().catch(randomBytes(32).toString('base64'))

const shape = z.looseObject({
  // Never re-roll these: the master key encrypts stored miner credentials.
  dbPassword: z
    .string()
    .catch(utils.getDefaultString({ charset: 'a-z,A-Z,0-9', len: 32 })),
  authSecretKey: key(),
  encryptMasterKey: key(),
  adminPassword: z.string().optional().catch(undefined),
  // false while a rotated adminPassword has not yet reached Proto Fleet.
  adminPasswordApplied: z.boolean().catch(false),
  profile: z.enum(profiles).catch('mini'),
})

export const storeJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'store.json' },
  shape,
)
