-- Permite configurar quantos alunos (1 a 3) podem responder uma mesma prova
ALTER TABLE provas_professor ADD COLUMN IF NOT EXISTS max_alunos INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS provas_professor_participantes (
  id SERIAL PRIMARY KEY,
  prova_id INTEGER REFERENCES provas_professor(id) ON DELETE CASCADE,
  aluno_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  entrou_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(prova_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS idx_participantes_prova ON provas_professor_participantes(prova_id);
