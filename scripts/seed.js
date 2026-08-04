const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString });

async function run() {
  const seedsDir = path.join(__dirname, '..', 'seeds');
  if (!fs.existsSync(seedsDir)) {
    console.error('No seeds directory found:', seedsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(seedsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const full = path.join(seedsDir, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log('Seeding', file);
    try {
      await pool.query(sql);
    } catch (err) {
      console.error('Seed failed:', file, err.message);
      process.exit(1);
    }
  }

  console.log('Seeds applied');

  // ensure default admin and professor users exist with known password
  try {
    const bcrypt = require('bcrypt');
    const pwd = '12345678';
    const hash = await bcrypt.hash(pwd, 10);

    // ensure there is at least one company
    const empRes = await pool.query('SELECT id FROM empresas LIMIT 1');
    const empresaId = empRes.rows[0]?.id || null;

    // upsert admin
    await pool.query(`
      INSERT INTO usuarios (username, email, senha, role, empresa_id, verificado)
      VALUES ($1,$2,$3,$4,$5,TRUE)
      ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, role = EXCLUDED.role, verificado = TRUE
    `, ['ADM', 'adm@formulavest.com', hash, 'formulavest_master', empresaId]);

    // upsert professor
    await pool.query(`
      INSERT INTO usuarios (username, email, senha, role, empresa_id, verificado)
      VALUES ($1,$2,$3,$4,$5,TRUE)
      ON CONFLICT (email) DO UPDATE SET senha = EXCLUDED.senha, role = EXCLUDED.role, verificado = TRUE
    `, ['PROF', 'prof@formulavest.com', hash, 'professor', empresaId]);

    console.log('Default users ensured: adm@formulavest.com, prof@formulavest.com (password: 12345678)');
  } catch (err) {
    console.error('Error ensuring default users', err.message || err);
  }

  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
