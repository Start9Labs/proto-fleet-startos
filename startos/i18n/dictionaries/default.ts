export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting Proto Fleet!': 0,
  Database: 1,
  'The database is ready': 2,
  'Waiting for the database to be ready': 3,
  'Fleet Server': 4,
  'The fleet server is ready': 5,
  'The fleet server is not ready': 6,
  'Web Interface': 7,
  'The web interface is ready': 8,
  'The web interface is not ready': 9,

  // interfaces.ts
  'Web UI': 10,
  'The Proto Fleet dashboard for pairing and managing miners': 11,

  // actions/setAdminPassword.ts
  'Set Admin Password': 12,
  'Generate a new random password for the Proto Fleet super admin account. Replaces any existing password.': 13,
  'Replaces the current admin password and signs out every session of the super admin.': 14,
  'Proto Fleet Admin Credentials': 15,
  'Use these credentials to sign in to Proto Fleet.': 16,
  'Use these credentials to sign in to Proto Fleet. The password takes effect the next time Proto Fleet starts.': 17,
  Username: 18,
  Password: 19,

  // init/watchCredentials.ts
  'Set the admin password before signing in to Proto Fleet': 20,

  // actions/setProfile.ts
  'Performance Profile': 21,
  'Size the database and the miner polling for the number of miners you manage.': 22,
  Profile: 23,
  '- Mini: up to about 200 miners; fits a server shared with other services.\n- Standard: up to about 5,000 miners; wants 16 GB of memory and an SSD.\n- Max: more than 5,000 miners; wants a dedicated server with 32 GB of memory or more.': 24,
  Mini: 25,
  Standard: 26,
  Max: 27,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
