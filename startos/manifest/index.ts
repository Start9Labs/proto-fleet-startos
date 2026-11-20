import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'proto-fleet',
  title: 'Proto Fleet',
  license: 'Apache-2.0',
  packageRepo: 'https://github.com/Start9Labs/proto-fleet-startos',
  upstreamRepo: 'https://github.com/block/proto-fleet',
  marketingUrl: 'https://proto.xyz',
  donationUrl: null,
  description: { short, long },
  volumes: ['main', 'db'],
  images: {
    fleet: {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64'],
    },
    timescaledb: {
      source: {
        dockerBuild: {
          workdir: 'proto-fleet/server/timescaledb',
        },
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
})
