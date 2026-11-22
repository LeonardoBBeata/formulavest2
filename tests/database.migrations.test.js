jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: jest.fn()
  }))
}));

const fs = require('fs');
const path = require('path');
const { db, initDB } = require('../config/database');

describe('verificação de migrations no startup', () => {
  const originalAutoMigrate = process.env.DB_AUTO_MIGRATE;
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => /^\d+_.+\.sql$/.test(file))
    .sort();

  beforeEach(() => {
    process.env.DB_AUTO_MIGRATE = 'false';
    db.query.mockReset();
    db.query.mockResolvedValueOnce({ rows: [] });
  });

  afterAll(() => {
    if (originalAutoMigrate === undefined) delete process.env.DB_AUTO_MIGRATE;
    else process.env.DB_AUTO_MIGRATE = originalAutoMigrate;
  });

  test('recusa iniciar se qualquer migration existente estiver pendente', async () => {
    const applied = migrationFiles.slice(0, -1).map(filename => ({ filename }));
    db.query.mockResolvedValueOnce({ rows: applied });

    await expect(initDB()).rejects.toThrow(`Migrations pendentes: ${migrationFiles.at(-1)}`);
  });

  test('inicia quando todas as migrations locais já foram aplicadas', async () => {
    db.query.mockResolvedValueOnce({
      rows: migrationFiles.map(filename => ({ filename }))
    });

    await expect(initDB()).resolves.toBe(true);
  });
});
