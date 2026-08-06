const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const useSSL =
  process.env.DATABASE_SSL === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

// Support DATABASE_URL or individual PG_* environment variables with sensible defaults for local dev
const connectionString = process.env.DATABASE_URL || (() => {
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || 5432;
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB || 'formulavest';
  const user = process.env.PGUSER || process.env.POSTGRES_USER || 'postgres';
  const password = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'postgres';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
})();

const poolMax = Number(process.env.DB_POOL_MAX) || 20;

const db = new Pool({
  connectionString,
  ssl: useSSL
    ? {
        rejectUnauthorized: false
      }
    : false,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// helpful startup log (do not print password)
try {
  const urlForLog = new URL(connectionString);
  console.log(`Connecting to Postgres host=${urlForLog.hostname} db=${urlForLog.pathname.replace('/', '')}`);
} catch (_) {
  // ignore
}

async function initDB() {
  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.warn('PostgreSQL indisponível:', err.message);
    return false;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS usuarios(
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      senha TEXT NOT NULL,
      verificado BOOLEAN DEFAULT FALSE,
      codigo_verificacao TEXT,
      xp INTEGER DEFAULT 0,
      nivel INTEGER DEFAULT 1,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS foto TEXT
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS banido BOOLEAN DEFAULT FALSE
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS provas_ativas(
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      questoes JSONB NOT NULL,
      finalizada BOOLEAN DEFAULT FALSE,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT FALSE
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS codigo_verificacao TEXT
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS provas(
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      acertos INTEGER,
      total INTEGER,
      percentual REAL,
      questoes JSONB,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS login_codigo TEXT
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS reset_token TEXT
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS reset_expira TIMESTAMP
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS empresas(
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS escolas(
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER
        REFERENCES empresas(id)
        ON DELETE CASCADE,
      nome TEXT NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS periodos(
      id SERIAL PRIMARY KEY,
      escola_id INTEGER
        REFERENCES escolas(id)
        ON DELETE CASCADE,
      nome TEXT NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS salas(
      id SERIAL PRIMARY KEY,
      periodo_id INTEGER
        REFERENCES periodos(id)
        ON DELETE CASCADE,
      nome TEXT NOT NULL
    )
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS empresa_id INTEGER
    REFERENCES empresas(id)
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS escola_id INTEGER
    REFERENCES escolas(id)
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS periodo_id INTEGER
    REFERENCES periodos(id)
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS sala_id INTEGER
    REFERENCES salas(id)
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS last_active TIMESTAMP
  `);

  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS role TEXT
    DEFAULT 'aluno'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS conquistas_historico(
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      chave TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      meta JSONB DEFAULT '{}',
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS professor_salas(
      id SERIAL PRIMARY KEY,
      professor_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      sala_id INTEGER REFERENCES salas(id) ON DELETE CASCADE,
      UNIQUE(professor_id, sala_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS redacoes(
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      tema TEXT NOT NULL,
      texto TEXT NOT NULL,
      resultado JSONB NOT NULL,
      nota_total INTEGER,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS provas_professor(
      id SERIAL PRIMARY KEY,
      professor_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      escola_id INTEGER REFERENCES escolas(id),
      sala_id INTEGER REFERENCES salas(id),
      titulo TEXT NOT NULL,
      tempo_minutos INTEGER NOT NULL,
      codigo TEXT UNIQUE,
      status TEXT DEFAULT 'rascunho',
      questoes JSONB NOT NULL,
      inicia_em TIMESTAMP,
      encerra_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS respostas_provas_professor(
      id SERIAL PRIMARY KEY,
      prova_id INTEGER REFERENCES provas_professor(id) ON DELETE CASCADE,
      aluno_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      respostas JSONB NOT NULL,
      acertos INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percentual REAL NOT NULL,
      finalizada_em TIMESTAMP DEFAULT NOW(),
      UNIQUE(prova_id, aluno_id)
    )
  `);

  console.log('Banco OK');
  return true;
}

async function criarAdmMaster() {
  try {
    const email = 'adm@formulavest.com';
    const senha = process.env.MASTER_PASSWORD;

    if (!senha) {
      console.warn('MASTER_PASSWORD nao definido; ADM master nao foi criado.');
      return;
    }

    const existe = await db.query(
      `
      SELECT id
      FROM usuarios
      WHERE email = $1
    `,
      [email]
    );

    if (existe.rows.length > 0) {
      console.log('ADM master ja existe');
      return;
    }

    const empresa = await db.query(`
      INSERT INTO empresas(nome)
      VALUES('FormulaVest')
      RETURNING id
    `);

    const empresaId = empresa.rows[0].id;
    const hash = await bcrypt.hash(senha, 10);

    await db.query(
      `
      INSERT INTO usuarios(
        username,
        email,
        senha,
        role,
        empresa_id,
        verificado
      )
      VALUES(
        $1,$2,$3,$4,$5,TRUE
      )
    `,
      [
        'ADM',
        email,
        hash,
        'formulavest_master',
        empresaId
      ]
    );

    console.log('ADM MASTER CRIADO');
  } catch (err) {
    console.error('Erro ao criar ADM:', err);
  }
}

module.exports = {
  criarAdmMaster,
  db,
  initDB
};
