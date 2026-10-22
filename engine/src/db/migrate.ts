import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { db, pool } from './client.js'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
await migrate(db, { migrationsFolder })
await pool.end()
console.log('migrated')
