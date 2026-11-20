import { sdk } from '../sdk'
import { setAdminPassword } from './setAdminPassword'
import { setProfile } from './setProfile'

export const actions = sdk.Actions.of()
  .addAction(setAdminPassword)
  .addAction(setProfile)
