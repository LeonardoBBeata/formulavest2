CREATE INDEX IF NOT EXISTS idx_provas_usuario_id_id_desc
  ON provas (usuario_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_respostas_finalizadas_aluno_data
  ON respostas_provas_professor (aluno_id, finalizada_em DESC)
  WHERE finalizada = TRUE;
