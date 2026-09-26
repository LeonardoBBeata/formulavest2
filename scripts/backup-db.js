require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não definido. Não é possível criar backup.');

const destination = path.resolve(process.env.BACKUP_DIR || 'backups');
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS) || 14);
fs.mkdirSync(destination, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(destination, `formulavest-${timestamp}.dump`);
const result = spawnSync('pg_dump', ['--format=custom', '--no-owner', `--file=${output}`, databaseUrl], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.status !== 0) {
  fs.rmSync(output, { force: true });
  throw new Error('pg_dump falhou. Instale as ferramentas do PostgreSQL e confira DATABASE_URL.');
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const name of fs.readdirSync(destination)) {
  const file = path.join(destination, name);
  const stat = fs.statSync(file);
  if (stat.isFile() && name.endsWith('.dump') && stat.mtimeMs < cutoff) fs.rmSync(file);
}

console.log(`Backup criado: ${output}`);
