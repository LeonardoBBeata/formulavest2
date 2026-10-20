INSERT INTO empresas (nome)
SELECT 'FormulaVest'
WHERE NOT EXISTS (
  SELECT 1 FROM empresas WHERE LOWER(nome) = LOWER('FormulaVest')
);
