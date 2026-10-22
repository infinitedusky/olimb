/** Vitest global setup: make sure the test database exists and is migrated. Skips quietly if Postgres is down. */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TEST_DATABASE_URL } from '../vitest.config.js'

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() })
  try { await admin.connect() } catch { console.warn('test-setup: Postgres not reachable; database-backed tests will be skipped'); return }
  const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName])
  if (!exists.rowCount) await admin.query(`create database "${dbName}"`)
  await admin.end()
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
  await pool.end()
}
