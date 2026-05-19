/**
 * auth-schema -- Drizzle schema for the auth.db SQLite file.
 *
 * Better Auth manages most of these via its core tables (users, sessions,
 * accounts, verification). We extend with:
 *
 *   • passkeys           -- WebAuthn credentials (label + last_used)
 *   • invite_codes       -- owner-generated 6-digit codes for new user signup
 *   • backup_codes       -- 2FA recovery codes (hashed)
 *   • audit_log          -- append-only log of every auth event
 *   • pending_deletions  -- soft-delete grace period tracking
 *
 * Times stored as INTEGER ms-epoch on disk; Drizzle's `{ mode: 'timestamp_ms' }`
 * surfaces them as JS `Date` objects in TypeScript, which is what Better
 * Auth's internal models expect for read+write.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Better Auth core: users */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'member'
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  // Soft-delete marker -- non-null means scheduled for deletion at day 30.
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

/** Better Auth core: sessions */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Better Auth core: accounts (oauth + email/password + passkey hybrid).
 *  For passkeys we use the dedicated `passkeys` table below; this is for
 *  oauth-provider-linked accounts (GitHub, in our case). */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(), // 'github' | 'credential' | 'passkey'
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Better Auth core: verification (used for email magic-link tokens if ever
 *  enabled, and for our own short-lived auth flows). */
export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // typically the email
  value: text('value').notNull(), // the token/code
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Passkeys table -- Better Auth's passkey plugin schema. */
export const passkeys = sqliteTable('passkeys', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type').notNull(), // 'singleDevice' | 'multiDevice'
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  transports: text('transports'), // CSV: 'usb,nfc,ble,internal'
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
});

/** Invite codes -- owner generates a 6-digit code, invitee uses it at signup.
 *  Single-use, 30-minute TTL. */
export const inviteCodes = sqliteTable('invite_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(), // 6-digit string
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  claimedByUserId: text('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 2FA backup codes -- hashed (sha-256), single-use. */
export const backupCodes = sqliteTable('backup_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Audit log -- append-only. Even admins can't delete.
 *  Events: signup, login, login-failed, logout, passkey-add, passkey-revoke,
 *  oauth-link, oauth-unlink, deletion-requested, deletion-cancelled,
 *  account-restored, data-exported, role-changed, backup-code-used. */
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id'), // nullable — anonymized on hard delete
  eventType: text('event_type').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: text('details'), // JSON blob
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
});

/** Pending deletions -- soft-delete tracking with 30-day grace. */
export const pendingDeletions = sqliteTable('pending_deletions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
  scheduledFor: integer('scheduled_for', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
});
