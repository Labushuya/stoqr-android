import { users, sessions, accounts, verifications } from '@stoqr/db'

export const betterAuthTables = {
  users,
  sessions,
  accounts,
  verifications,
} as const
