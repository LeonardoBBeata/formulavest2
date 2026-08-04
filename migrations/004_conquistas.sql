-- Migration: cria tabela de histórico de conquistas
CREATE TABLE IF NOT EXISTS conquistas_historico (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  titulo TEXT,
  descricao TEXT,
  meta JSONB,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conquistas_usuario ON conquistas_historico(usuario_id);
