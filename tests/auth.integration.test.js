const request = require('supertest');
const crypto = require('crypto');

const runDbTests = process.env.RUN_DB_TESTS === 'true';
const describeDb = runDbTests ? describe : describe.skip;

describeDb('Autenticação e autorização com PostgreSQL', () => {
  const { initDB, db } = require('../config/database');
  const app = require('../server');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `teste-${suffix}@example.test`;
  const username = `teste_${suffix}`.slice(0, 45);
  const targetEmail = `aluno-${suffix}@example.test`;
  let accessCookie = '';
  let databaseReady = false;
  let fixtureEmpresaId;
  let fixtureSchoolAId;
  let fixtureSchoolBId;
  let fixtureTargetId;
  let testCreatedProofId;
  let testActiveId;
  let testSavedResultId;

  beforeAll(async () => {
    databaseReady = await initDB();
    if (!databaseReady) throw new Error('PostgreSQL indisponível para os testes de integração. Inicie o banco e tente novamente.');
  });

  afterAll(async () => {
    if (databaseReady) {
      if (testCreatedProofId) await db.query('DELETE FROM provas_professor WHERE id = $1', [testCreatedProofId]);
      if (testSavedResultId) await db.query('DELETE FROM provas WHERE id = $1', [testSavedResultId]);
      if (testActiveId) await db.query('DELETE FROM provas_ativas WHERE id = $1', [testActiveId]);
      await db.query('DELETE FROM usuarios WHERE username = ANY($1::text[])', [[username, `aluno_${suffix}`]]);
      if (fixtureEmpresaId) await db.query('DELETE FROM empresas WHERE id = $1', [fixtureEmpresaId]);
      await db.end();
    }
  });

  test('cadastro, verificação, login por cookie e bloqueio administrativo', async () => {
    const cadastro = await request(app)
      .post('/register')
      .send({ username, email, senha: 'senha-de-teste-123' });
    expect(cadastro.statusCode).toBe(200);
    expect(cadastro.body.dev_codigo).toMatch(/^\d{6}$/);

    const verificacao = await request(app)
      .post('/verificar-email')
      .send({ email, codigo: cadastro.body.dev_codigo });
    expect(verificacao.statusCode).toBe(200);

    const inicio = await request(app)
      .post('/login-iniciar')
      .send({ email, senha: 'senha-de-teste-123' });
    expect(inicio.statusCode).toBe(200);
    expect(inicio.body.dev_codigo).toMatch(/^\d{6}$/);

    const confirmacao = await request(app)
      .post('/login-confirmar')
      .send({ email, senha: 'senha-de-teste-123', codigo: inicio.body.dev_codigo });
    expect(confirmacao.statusCode).toBe(200);
    expect(confirmacao.body.token).toBeUndefined();
    accessCookie = confirmacao.headers['set-cookie'].find(cookie => cookie.startsWith('accessToken='));
    expect(accessCookie).toContain('HttpOnly');

    const perfil = await request(app).get('/me').set('Cookie', accessCookie);
    expect(perfil.statusCode).toBe(200);
    expect(perfil.body.email).toBe(email);

    const admin = await request(app).get('/admin-check').set('Cookie', accessCookie);
    expect(admin.statusCode).toBe(403);
  });

  test('admin fica limitado à escola e respostas não incluem hash de senha', async () => {
    const company = await db.query("INSERT INTO empresas(nome) VALUES($1) RETURNING id", [`Escopo ${suffix}`]);
    fixtureEmpresaId = company.rows[0].id;
    const schoolA = await db.query('INSERT INTO escolas(empresa_id,nome) VALUES($1,$2) RETURNING id', [fixtureEmpresaId, `Escola A ${suffix}`]);
    const schoolB = await db.query('INSERT INTO escolas(empresa_id,nome) VALUES($1,$2) RETURNING id', [fixtureEmpresaId, `Escola B ${suffix}`]);
    fixtureSchoolAId = schoolA.rows[0].id;
    fixtureSchoolBId = schoolB.rows[0].id;
    const target = await db.query(
      'INSERT INTO usuarios(username,email,senha,role,empresa_id,escola_id,verificado) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id',
      [`aluno_${suffix}`, targetEmail, 'not-a-real-password-hash', 'aluno', fixtureEmpresaId, schoolB.rows[0].id]
    );
    fixtureTargetId = target.rows[0].id;
    await db.query('UPDATE usuarios SET role=$1, empresa_id=$2, escola_id=$3 WHERE email=$4', ['diretor', fixtureEmpresaId, schoolA.rows[0].id, email]);

    const cookie = { Cookie: accessCookie };
    const ban = await request(app).put(`/admin/usuario/${target.rows[0].id}/banir`).set(cookie);
    expect(ban.statusCode).toBe(403);
    const remove = await request(app).delete(`/admin/usuario/${target.rows[0].id}`).set(cookie);
    expect(remove.statusCode).toBe(403);
    const update = await request(app).put(`/admin/usuario/${target.rows[0].id}`).set(cookie).send({
      username: `aluno_${suffix}`,
      email: targetEmail,
      role: 'aluno'
    });
    expect(update.statusCode).toBe(403);

    const listing = await request(app).get('/admin/usuarios').set(cookie);
    expect(listing.statusCode).toBe(200);
    expect(listing.body.usuarios.some(user => user.id === target.rows[0].id)).toBe(false);
    expect(listing.body.usuarios.every(user => !Object.prototype.hasOwnProperty.call(user, 'senha'))).toBe(true);
  });

  test('rotas de professor e provas bloqueiam acesso fora do escopo', async () => {
    const periodB = await db.query('INSERT INTO periodos(escola_id,nome) VALUES($1,$2) RETURNING id', [fixtureSchoolBId, `Período B ${suffix}`]);
    const roomB = await db.query('INSERT INTO salas(periodo_id,nome) VALUES($1,$2) RETURNING id', [periodB.rows[0].id, `Sala B ${suffix}`]);
    await expect(db.query(
      'INSERT INTO salas(periodo_id,nome) VALUES($1,$2)',
      [periodB.rows[0].id, `sala b ${suffix}`]
    )).rejects.toMatchObject({ code: '23505' });
    const proofB = await db.query(
      'INSERT INTO provas_professor(professor_id,escola_id,sala_id,titulo,tempo_minutos,questoes) VALUES($1,$2,$3,$4,30,$5) RETURNING id',
      [fixtureTargetId, fixtureSchoolBId, roomB.rows[0].id, `Prova B ${suffix}`, JSON.stringify([{ enunciado: 'Q', opcoes: { A: '1' }, correta: 'A' }])]
    );
    testCreatedProofId = proofB.rows[0].id;

    const cookie = { Cookie: accessCookie };
    const lista = await request(app).get('/professor/provas').set(cookie);
    expect(lista.statusCode).toBe(200);
    expect(lista.body.provas.some(prova => prova.id === proofB.rows[0].id)).toBe(false);

    const exportPeriod = await request(app).get(`/professor/export/periodo/${periodB.rows[0].id}`).set(cookie);
    expect(exportPeriod.statusCode).toBe(403);
    const exportRoom = await request(app).get(`/professor/export/sala/${roomB.rows[0].id}`).set(cookie);
    expect(exportRoom.statusCode).toBe(403);
    const createRoom = await request(app).post('/professor/salas').set(cookie).send({ periodo_id: periodB.rows[0].id, nome: 'Não autorizado' });
    expect(createRoom.statusCode).toBe(403);
    const createExam = await request(app).post('/professor/provas').set(cookie).send({
      titulo: 'Não autorizado',
      tempo_minutos: 30,
      sala_id: roomB.rows[0].id,
      questoes: [{ enunciado: 'Q', opcoes: { A: '1' }, correta: 'A' }]
    });
    expect(createExam.statusCode).toBe(403);

    const { gerarToken } = require('../middlewares/auth');
    const studentToken = gerarToken({
      id: fixtureTargetId,
      username: `aluno_${suffix}`,
      role: 'aluno',
      empresa_id: fixtureEmpresaId,
      escola_id: fixtureSchoolBId,
      token_version: 0
    });
    const deniedImport = await request(app)
      .post('/professor/provas/importar')
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('arquivo', Buffer.from('%PDF-1.7'), { filename: 'teste.pdf', contentType: 'application/pdf' });
    expect(deniedImport.statusCode).toBe(403);

    await db.query('UPDATE usuarios SET escola_id = NULL WHERE email = $1', [email]);
    const unscopedList = await request(app).get('/professor/provas').set(cookie);
    expect(unscopedList.statusCode).toBe(403);
    await db.query('UPDATE usuarios SET escola_id = $1 WHERE email = $2', [fixtureSchoolAId, email]);

    const profile = await request(app).put('/atualizar-perfil').set(cookie).send({ email: `novo-${suffix}@example.test` });
    expect(profile.statusCode).toBe(400);
    await db.query('UPDATE usuarios SET empresa_id = NULL, escola_id = NULL WHERE email = $1', [email]);
    const unscopedRanking = await request(app).get('/ranking').set(cookie);
    expect(unscopedRanking.statusCode).toBe(403);
    await db.query('UPDATE usuarios SET empresa_id = $1, escola_id = $2 WHERE email = $3', [fixtureEmpresaId, fixtureSchoolAId, email]);

    const active = await db.query(
      'INSERT INTO provas_ativas(usuario_id,questoes) VALUES((SELECT id FROM usuarios WHERE email=$1),$2) RETURNING id',
      [email, JSON.stringify([
        { enunciado: 'Q1', opcoes: { A: '1' }, correta: 'A' },
        { enunciado: 'Q2', opcoes: { A: '2' }, correta: 'B' }
      ])]
    );
    testActiveId = active.rows[0].id;
    const parcial = await request(app).post('/salvar-prova').set(cookie).send({ prova_id: testActiveId, questoes: [{ selecionada: 'A' }] });
    expect(parcial.statusCode).toBe(400);

    const finalizada = await request(app).post('/salvar-prova').set(cookie).send({
      prova_id: testActiveId,
      questoes: [{ selecionada: 'A' }, { selecionada: 'A' }]
    });
    expect(finalizada.statusCode).toBe(200);
    expect(finalizada.body).toMatchObject({ acertos: 1, total: 2, percentual: 50 });
    const recorded = await db.query('SELECT id FROM provas WHERE usuario_id = (SELECT id FROM usuarios WHERE email=$1) ORDER BY id DESC LIMIT 1', [email]);
    testSavedResultId = recorded.rows[0].id;

    const repetida = await request(app).post('/salvar-prova').set(cookie).send({ prova_id: testActiveId, questoes: [{ selecionada: 'A' }, { selecionada: 'A' }] });
    expect(repetida.statusCode).toBe(400);

    const trocaSenha = await request(app).put('/atualizar-perfil').set(cookie).send({
      email,
      senha_atual: 'senha-de-teste-123',
      senha: 'senha-nova-de-teste-123'
    });
    expect(trocaSenha.statusCode).toBe(200);
    expect(trocaSenha.body.session_revoked).toBe(true);
    const sessaoAntiga = await request(app).get('/me').set(cookie);
    expect(sessaoAntiga.statusCode).toBe(401);

    const pendingEmail = `confirmado-${suffix}@example.test`;
    const pendingCode = '482916';
    await db.query(`
      UPDATE usuarios
      SET email_pendente=$1,
          email_pendente_codigo=$2,
          email_pendente_expira=NOW() + INTERVAL '10 minutes'
      WHERE username=$3
    `, [pendingEmail, crypto.createHash('sha256').update(pendingCode).digest('hex'), username]);
    const currentUser = (await db.query('SELECT id, username, role, empresa_id, escola_id, token_version FROM usuarios WHERE username=$1', [username])).rows[0];
    const renewedToken = gerarToken(currentUser);
    const emailConfirm = await request(app).post('/atualizar-email/confirmar')
      .set('Authorization', `Bearer ${renewedToken}`)
      .send({ email: pendingEmail, codigo: pendingCode });
    expect(emailConfirm.statusCode).toBe(200);
    expect(emailConfirm.body.session_revoked).toBe(true);
  });
});
