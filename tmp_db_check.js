const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/formulavest' });

(async () => {
  const result = await pool.query("SELECT id, username, email, role, empresa_id, verificado FROM usuarios WHERE email LIKE '%formulavest%' ORDER BY id ASC LIMIT 20");
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
