require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não definido. Configure-o antes de executar migrations.');
}
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

async function run() {
  const client = await pool.connect();
  let lockAcquired = false;
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  try {
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`No migrations directory found: ${migrationsDir}`);
    }

    await client.query('SELECT pg_advisory_lock($1)', [73190521]);
    lockAcquired = true;
    const files = fs.readdirSync(migrationsDir)
      .filter(file => /^\d+_.+\.sql$/.test(file))
      .sort();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (applied.rows.length) {
        console.log('Skipping', file);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log('Running', file);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed: ${file}: ${err.message}`, { cause: err });
      }
    }

    console.log('Migrations applied');
  } finally {
    try {
      if (lockAcquired) await client.query('SELECT pg_advisory_unlock($1)', [73190521]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
