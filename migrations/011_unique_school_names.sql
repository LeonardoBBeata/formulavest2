DO $$
DECLARE
  changed_rows INTEGER;
BEGIN
  LOOP
    WITH duplicates AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY escola_id, LOWER(nome) ORDER BY id) AS position
      FROM periodos
      WHERE escola_id IS NOT NULL AND nome IS NOT NULL
    )
    UPDATE periodos p
    SET nome = p.nome || ' [registro-' || p.id::text || ']'
    FROM duplicates d
    WHERE p.id = d.id AND d.position > 1;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    EXIT WHEN changed_rows = 0;
  END LOOP;

  LOOP
    WITH duplicates AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY periodo_id, LOWER(nome) ORDER BY id) AS position
      FROM salas
      WHERE periodo_id IS NOT NULL AND nome IS NOT NULL
    )
    UPDATE salas s
    SET nome = s.nome || ' [registro-' || s.id::text || ']'
    FROM duplicates d
    WHERE s.id = d.id AND d.position > 1;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    EXIT WHEN changed_rows = 0;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_periodos_nome_unico ON periodos;
DROP TRIGGER IF EXISTS trg_salas_nome_unico ON salas;
DROP FUNCTION IF EXISTS impedir_periodo_duplicado();
DROP FUNCTION IF EXISTS impedir_sala_duplicada();
DROP INDEX IF EXISTS idx_periodos_escola_nome_lower;
DROP INDEX IF EXISTS idx_salas_periodo_nome_lower;

CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_escola_nome_unique
  ON periodos (escola_id, LOWER(nome));
CREATE UNIQUE INDEX IF NOT EXISTS idx_salas_periodo_nome_unique
  ON salas (periodo_id, LOWER(nome));
