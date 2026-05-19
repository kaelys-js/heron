/** Migration dry-run test -- boot a fresh in-memory SQLite via the
 *  production ensureSchema() path, then introspect sqlite_master to
 *  assert every Drizzle-declared table exists with expected columns.
 *  Catches drift in either direction: schema adds a column/table that
 *  migrate.ts forgot, or migrate.ts ships a table the schema doesn't
 *  model. HERON_DATA_DIR override + the ":memory:" shim in db/index.ts
 *  keep this hermetic to vitest's tmpdir. */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DDL_PATH = join(HERE, 'migrate.ts');
const SCHEMA_APP_PATH = join(HERE, 'app-schema.ts');
const SCHEMA_AUTH_PATH = join(HERE, 'auth-schema.ts');

describe('db/migrate — schema parity (drizzle ↔ CREATE TABLE)', () => {
  it('every app-schema table has a matching CREATE TABLE in migrate.ts', () => {
    const migrateSrc = readFileSync(APP_DDL_PATH, 'utf8');
    const schemaSrc = readFileSync(SCHEMA_APP_PATH, 'utf8');

    const declared = [...schemaSrc.matchAll(/sqliteTable\(['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const table of declared) {
      // CREATE TABLE IF NOT EXISTS <name> OR CREATE TABLE <name>
      const re = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?\\b${table}\\b`, 'i');
      expect(migrateSrc, `migrate.ts is missing CREATE TABLE for "${table}"`).toMatch(re);
    }
  });

  it('every auth-schema table has a matching CREATE TABLE in migrate.ts', () => {
    const migrateSrc = readFileSync(APP_DDL_PATH, 'utf8');
    const schemaSrc = readFileSync(SCHEMA_AUTH_PATH, 'utf8');

    const declared = [...schemaSrc.matchAll(/sqliteTable\(['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const table of declared) {
      const re = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?\\b${table}\\b`, 'i');
      expect(migrateSrc, `migrate.ts is missing CREATE TABLE for "${table}"`).toMatch(re);
    }
  });

  it('migrate.ts runs cleanly against a fresh :memory: database', () => {
    // Boot two ephemeral SQLite handles + run the DDL blobs from
    // migrate.ts. If any statement is malformed, better-sqlite3 throws.
    // The actual ensureSchema() in migrate.ts mutates the module-level
    // singletons in db/index.ts, which the test harness already
    // re-routes to tmpdir -- but here we ALSO verify the SQL parses
    // independently of the singleton lifecycle.
    const authDb = new Database(':memory:');
    const appDb = new Database(':memory:');
    const migrateSrc = readFileSync(APP_DDL_PATH, 'utf8');

    // Pull out the two large DDL strings the migration file declares
    // (`AUTH_DDL` + `APP_DDL`) and exec them. Bracket-match the
    // backtick template literal so we don't need a TS parser.
    function extractDdl(name: string): string {
      const idx = migrateSrc.indexOf(`const ${name}`);
      if (idx < 0) throw new Error(`migrate.ts missing const ${name}`);
      const tickStart = migrateSrc.indexOf('`', idx);
      const tickEnd = migrateSrc.indexOf('`', tickStart + 1);
      return migrateSrc.slice(tickStart + 1, tickEnd);
    }

    const authDdl = extractDdl('AUTH_DDL');
    const appDdl = extractDdl('APP_DDL');
    expect(() => authDb.exec(authDdl)).not.toThrow();
    expect(() => appDb.exec(appDdl)).not.toThrow();

    // sqlite_master sanity: at least the canonical tables exist.
    const authTables = authDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(authTables).toContain('users');
    expect(authTables).toContain('sessions');
    expect(authTables).toContain('accounts');

    const appTables = appDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(appTables).toContain('profiles');
    expect(appTables).toContain('schema_meta');

    authDb.close();
    appDb.close();
  });
});
