DELETE FROM conquistas_historico newer
USING conquistas_historico older
WHERE newer.usuario_id = older.usuario_id
  AND newer.chave = older.chave
  AND newer.id > older.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conquistas_usuario_chave
  ON conquistas_historico(usuario_id, chave);
