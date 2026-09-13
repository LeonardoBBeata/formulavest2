-- Separa respostas parciais de envios finalizados na prova ao vivo.
ALTER TABLE respostas_provas_professor
ADD COLUMN IF NOT EXISTS finalizada BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_respostas_provas_professor_finalizada
ON respostas_provas_professor(prova_id, aluno_id, finalizada);
