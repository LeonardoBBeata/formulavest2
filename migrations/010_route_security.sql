ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_pendente TEXT,
  ADD COLUMN IF NOT EXISTS email_pendente_codigo TEXT,
  ADD COLUMN IF NOT EXISTS email_pendente_expira TIMESTAMP;

UPDATE usuarios
SET codigo_verificacao = NULL,
    codigo_verificacao_expira = NULL
WHERE codigo_verificacao IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_pendente_unique
  ON usuarios (LOWER(email_pendente))
  WHERE email_pendente IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_periodos_escola_nome_lower
  ON periodos (escola_id, LOWER(nome));
CREATE INDEX IF NOT EXISTS idx_salas_periodo_nome_lower
  ON salas (periodo_id, LOWER(nome));

CREATE OR REPLACE FUNCTION impedir_periodo_duplicado() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.escola_id IS NOT DISTINCT FROM OLD.escola_id
    AND LOWER(NEW.nome) IS NOT DISTINCT FROM LOWER(OLD.nome) THEN
    RETURN NEW;
  END IF;
  IF NEW.escola_id IS NULL OR NEW.nome IS NULL THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('periodo:' || NEW.escola_id::text || ':' || LOWER(NEW.nome), 0));
  IF EXISTS (
    SELECT 1 FROM periodos
    WHERE escola_id = NEW.escola_id AND LOWER(nome) = LOWER(NEW.nome)
      AND id <> COALESCE(NEW.id, 0)
  ) THEN
    IF TG_OP = 'INSERT' THEN RETURN NULL; END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Periodo ja existe nesta escola';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION impedir_sala_duplicada() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.periodo_id IS NOT DISTINCT FROM OLD.periodo_id
    AND LOWER(NEW.nome) IS NOT DISTINCT FROM LOWER(OLD.nome) THEN
    RETURN NEW;
  END IF;
  IF NEW.periodo_id IS NULL OR NEW.nome IS NULL THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sala:' || NEW.periodo_id::text || ':' || LOWER(NEW.nome), 0));
  IF EXISTS (
    SELECT 1 FROM salas
    WHERE periodo_id = NEW.periodo_id AND LOWER(nome) = LOWER(NEW.nome)
      AND id <> COALESCE(NEW.id, 0)
  ) THEN
    IF TG_OP = 'INSERT' THEN RETURN NULL; END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Sala ja existe neste periodo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_periodos_nome_unico ON periodos;
CREATE TRIGGER trg_periodos_nome_unico
  BEFORE INSERT OR UPDATE OF escola_id, nome ON periodos
  FOR EACH ROW EXECUTE FUNCTION impedir_periodo_duplicado();

DROP TRIGGER IF EXISTS trg_salas_nome_unico ON salas;
CREATE TRIGGER trg_salas_nome_unico
  BEFORE INSERT OR UPDATE OF periodo_id, nome ON salas
  FOR EACH ROW EXECUTE FUNCTION impedir_sala_duplicada();