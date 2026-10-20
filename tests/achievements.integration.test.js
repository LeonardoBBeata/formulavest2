const request = require('supertest');

const runDbTests = process.env.RUN_DB_TESTS === 'true';
const describeDb = runDbTests ? describe : describe.skip;

describeDb('Conquistas com PostgreSQL', () => {
  const { db } = require('../config/database');
  const app = require('../server');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const username = `achievements_${suffix}`.slice(0, 45);
  const email = `achievements-${suffix}@example.test`;
  let userId;
  let token;

  beforeAll(async () => {
    const { rows } = await db.query(
      "INSERT INTO usuarios(username,email,senha,role,verificado,xp,nivel) VALUES($1,$2,'test-hash','aluno',TRUE,120,5) RETURNING id",
      [username, email]
    );
    userId = rows[0].id;
    const { gerarToken } = require('../middlewares/auth');
    token = gerarToken({
      id: userId,
      username,
      role: 'aluno',
      empresa_id: null,
      escola_id: null,
      token_version: 0
    });

    await db.query(`
      INSERT INTO provas(usuario_id,acertos,total,percentual,criado_em,questoes)
      VALUES
        ($1, 2, 2, 100, CURRENT_DATE - INTERVAL '2 days' + INTERVAL '12 hours', '[]'::jsonb),
        ($1, 1, 2, 50, CURRENT_DATE - INTERVAL '1 day' + INTERVAL '12 hours', '[]'::jsonb),
        ($1, 2, 2, 100, CURRENT_DATE + INTERVAL '12 hours', '[]'::jsonb)
    `, [userId]);
  });

  afterAll(async () => {
    if (userId) {
      await db.query('DELETE FROM conquistas_historico WHERE usuario_id = $1', [userId]);
      await db.query('DELETE FROM provas WHERE usuario_id = $1', [userId]);
      await db.query('DELETE FROM provas_ativas WHERE usuario_id = $1', [userId]);
      await db.query('DELETE FROM usuarios WHERE id = $1', [userId]);
      await db.end();
    }
  });

  test('desbloqueia marcos de provas, XP, nível e streak sem duplicar histórico', async () => {
    const first = await request(app).get('/me/conquistas').set('Authorization', `Bearer ${token}`);
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({
      total: 3,
      xp: 120,
      nivel: 5,
      conquistas: {
        primeira_prova: true,
        tres_provas: true,
        dez_provas: false,
        prova_perfeita: true,
        xp_100: true,
        nivel_5: true,
        streak_3: true,
        streak_days: 3
      }
    });
    expect(first.body.novas_conquistas.map(item => item.chave)).toEqual(expect.arrayContaining([
      'primeira_prova', 'tres_provas', 'prova_perfeita', 'xp_100', 'nivel_5', 'streak_3'
    ]));

    const second = await request(app).get('/me/conquistas').set('Authorization', `Bearer ${token}`);
    expect(second.statusCode).toBe(200);
    expect(second.body.novas_conquistas).toHaveLength(0);

    const historyCount = await db.query('SELECT COUNT(*)::int AS count FROM conquistas_historico WHERE usuario_id=$1', [userId]);
    expect(historyCount.rows[0].count).toBe(first.body.novas_conquistas.length);
  });
});
