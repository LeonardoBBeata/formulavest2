-- Seed a default company and master user (uses MASTER_PASSWORD env var)
INSERT INTO empresas (nome) VALUES ('FormulaVest') ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'adm@formulavest.com') THEN
    INSERT INTO usuarios (username, email, senha, role, empresa_id, verificado)
    VALUES ('ADM', 'adm@formulavest.com', 'REPLACE_THIS_HASH', 'formulavest_master', (SELECT id FROM empresas LIMIT 1), TRUE);
  END IF;
END $$;
