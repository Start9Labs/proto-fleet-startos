import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  profile: Value.select({
    name: i18n('Profile'),
    description: i18n(
      '- Mini: up to about 200 miners; fits a server shared with other services.\n- Standard: up to about 5,000 miners; wants 16 GB of memory and an SSD.\n- Max: more than 5,000 miners; wants a dedicated server with 32 GB of memory or more.',
    ),
    values: {
      mini: i18n('Mini'),
      standard: i18n('Standard'),
      max: i18n('Max'),
    },
    default: 'mini',
  }),
})

export const setProfile = sdk.Action.withInput(
  'set-profile',

  async ({ effects }) => ({
    name: i18n('Performance Profile'),
    description: i18n(
      'Size the database and the miner polling for the number of miners you manage.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects }) => ({
    profile: (await storeJson.read((s) => s.profile).once()) ?? undefined,
  }),

  async ({ effects, input }) =>
    storeJson.merge(effects, { profile: input.profile }),
)
