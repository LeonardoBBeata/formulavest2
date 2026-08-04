const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString });

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('No migrations directory found:', migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const full = path.join(migrationsDir, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log('Running', file);
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error('Migration failed:', file, err.message);
      process.exit(1);
    }
  }

  console.log('Migrations applied');
  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
