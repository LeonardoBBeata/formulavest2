-- Initial schema (keeps compatibility with existing initDB)
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
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS banido BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS login_codigo TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expira TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS escola_id INTEGER;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS periodo_id INTEGER;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sala_id INTEGER;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'aluno';

CREATE TABLE IF NOT EXISTS provas_ativas(
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  questoes JSONB NOT NULL,
  finalizada BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provas(
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  acertos INTEGER,
  total INTEGER,
  percentual REAL,
  questoes JSONB,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empresas(
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escolas(
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS periodos(
  id SERIAL PRIMARY KEY,
  escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS salas(
  id SERIAL PRIMARY KEY,
  periodo_id INTEGER REFERENCES periodos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redacoes(
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  tema TEXT NOT NULL,
  texto TEXT NOT NULL,
  resultado JSONB NOT NULL,
  nota_total INTEGER,
  criado_em TIMESTAMP DEFAULT NOW()
);

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
);

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
);
