CREATE TABLE IF NOT EXISTS professor_salas (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  sala_id INTEGER REFERENCES salas(id) ON DELETE CASCADE,
  UNIQUE (professor_id, sala_id)
);

CREATE INDEX IF NOT EXISTS idx_professor_salas_sala
  ON professor_salas(sala_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_escola_role
  ON usuarios(empresa_id, escola_id, role);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND conname = 'usuarios_empresa_id_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES empresas(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND conname = 'usuarios_escola_id_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_escola_id_fkey
      FOREIGN KEY (escola_id) REFERENCES escolas(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND conname = 'usuarios_periodo_id_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_periodo_id_fkey
      FOREIGN KEY (periodo_id) REFERENCES periodos(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND conname = 'usuarios_sala_id_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_sala_id_fkey
      FOREIGN KEY (sala_id) REFERENCES salas(id) NOT VALID;
  END IF;
END $$;
