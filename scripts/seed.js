require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString });

async function run() {
  const seedsDir = path.join(__dirname, '..', 'seeds');
  if (!fs.existsSync(seedsDir)) {
    throw new Error(`No seeds directory found: ${seedsDir}`);
  }

  const files = fs.readdirSync(seedsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const full = path.join(seedsDir, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log('Seeding', file);
    await pool.query(sql);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bcrypt = require('bcrypt');
    const empresaResult = await client.query(
      'SELECT id FROM empresas WHERE LOWER(nome) = LOWER($1) ORDER BY id LIMIT 1',
      ['FormulaVest']
    );
    const empresaId = empresaResult.rows[0]?.id;
    if (!empresaId) throw new Error('Empresa FormulaVest não encontrada');

    const masterResult = await client.query('SELECT id FROM usuarios WHERE email = $1', ['adm@formulavest.com']);
    if (!masterResult.rows.length) {
      if (!process.env.MASTER_PASSWORD) throw new Error('Defina MASTER_PASSWORD para criar a conta master');
      const masterHash = await bcrypt.hash(process.env.MASTER_PASSWORD, 10);
      await client.query(`
        INSERT INTO usuarios (username, email, senha, role, empresa_id, verificado)
        VALUES ($1, $2, $3, $4, $5, TRUE)
      `, ['ADM', 'adm@formulavest.com', masterHash, 'formulavest_master', empresaId]);
    }

    const escolaResult = await client.query(
      'SELECT id FROM escolas WHERE empresa_id = $1 AND LOWER(nome) = LOWER($2) ORDER BY id LIMIT 1',
      [empresaId, 'Escola FórmulaVest']
    );
    const escolaId = escolaResult.rows[0]?.id || (await client.query(
      'INSERT INTO escolas (empresa_id, nome) VALUES ($1, $2) RETURNING id',
      [empresaId, 'Escola FórmulaVest']
    )).rows[0].id;

    const periodoResult = await client.query(
      'SELECT id FROM periodos WHERE escola_id = $1 AND LOWER(nome) = LOWER($2) ORDER BY id LIMIT 1',
      [escolaId, 'Manhã']
    );
    const periodoId = periodoResult.rows[0]?.id || (await client.query(
      'INSERT INTO periodos (escola_id, nome) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
      [escolaId, 'Manhã']
    )).rows[0]?.id || (await client.query(
      'SELECT id FROM periodos WHERE escola_id = $1 AND LOWER(nome) = LOWER($2)',
      [escolaId, 'Manhã']
    )).rows[0].id;

    const salaResult = await client.query(
      'SELECT id FROM salas WHERE periodo_id = $1 AND LOWER(nome) = LOWER($2) ORDER BY id LIMIT 1',
      [periodoId, 'Turma A']
    );
    const salaId = salaResult.rows[0]?.id || (await client.query(
      'INSERT INTO salas (periodo_id, nome) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
      [periodoId, 'Turma A']
    )).rows[0]?.id || (await client.query(
      'SELECT id FROM salas WHERE periodo_id = $1 AND LOWER(nome) = LOWER($2)',
      [periodoId, 'Turma A']
    )).rows[0].id;

    const professorPassword = process.env.PROFESSOR_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : '12345678');
    if (!professorPassword) throw new Error('Defina PROFESSOR_PASSWORD para criar a conta professor em produção');
    const professorHash = await bcrypt.hash(professorPassword, 10);
    const professorResult = await client.query(`
      INSERT INTO usuarios (username, email, senha, role, empresa_id, escola_id, periodo_id, sala_id, verificado)
      VALUES ($1, $2, $3, 'professor', $4, $5, $6, $7, TRUE)
      ON CONFLICT (email) DO UPDATE SET
        username = EXCLUDED.username,
        senha = EXCLUDED.senha,
        role = 'professor',
        empresa_id = EXCLUDED.empresa_id,
        escola_id = EXCLUDED.escola_id,
        periodo_id = EXCLUDED.periodo_id,
        sala_id = EXCLUDED.sala_id,
        verificado = TRUE,
        banido = FALSE
      RETURNING id
    `, ['PROF', 'prof@formulavest.com', professorHash, empresaId, escolaId, periodoId, salaId]);

    await client.query(
      'INSERT INTO professor_salas (professor_id, sala_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [professorResult.rows[0].id, salaId]
    );
    await client.query('COMMIT');
    console.log('Seed pronto: master preservado; professor associado a Escola FórmulaVest / Manhã / Turma A.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
