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
  const inScopeStudentEmail = `aluno-local-${suffix}@example.test`;
  let accessCookie = '';
  let databaseReady = false;
  let fixtureEmpresaId;
  let fixtureSchoolAId;
  let fixtureSchoolBId;
  let fixtureCompanyBId;
  let crossCompanyUserId;
  let fixtureTargetId;
  let testCreatedProofId;
  let testActiveId;
  let testSavedResultId;
  let achievementUserId;

  beforeAll(async () => {
    databaseReady = await initDB();
    if (!databaseReady) throw new Error('PostgreSQL indisponível para os testes de integração. Inicie o banco e tente novamente.');
  });

  afterAll(async () => {
    if (databaseReady) {
      if (testCreatedProofId) {
        await db.query('DELETE FROM respostas_provas_professor WHERE prova_id = $1', [testCreatedProofId]);
        await db.query('DELETE FROM provas_professor_participantes WHERE prova_id = $1', [testCreatedProofId]);
        await db.query('DELETE FROM provas_professor WHERE id = $1', [testCreatedProofId]);
      }
      if (achievementUserId) await db.query('DELETE FROM conquistas_historico WHERE usuario_id = $1', [achievementUserId]);
      if (testSavedResultId) await db.query('DELETE FROM provas WHERE id = $1', [testSavedResultId]);
      if (testActiveId) await db.query('DELETE FROM provas_ativas WHERE id = $1', [testActiveId]);
      const testUsernames = [username, `aluno_${suffix}`, `aluno_editado_${suffix}`, `aluno_local_${suffix}`, `usuario_empresa_${suffix}`];
      const testEmails = [email, targetEmail, inScopeStudentEmail, `empresa-user-${suffix}@example.test`, `confirmado-${suffix}@example.test`];
      await db.query('DELETE FROM professor_salas WHERE professor_id = ANY($1::int[])', [[fixtureTargetId, crossCompanyUserId].filter(Boolean)]);
      await db.query('DELETE FROM usuarios WHERE id = ANY($1::int[]) OR username = ANY($2::text[]) OR email = ANY($3::text[])', [
        [fixtureTargetId, crossCompanyUserId].filter(Boolean),
        testUsernames,
        testEmails
      ]);
      if (fixtureCompanyBId) await db.query('DELETE FROM empresas WHERE id = $1', [fixtureCompanyBId]);
      if (fixtureEmpresaId) await db.query('DELETE FROM empresas WHERE id = $1', [fixtureEmpresaId]);
      await db.end();
    }
  });

  afterEach(async () => {
    if (databaseReady) {
      await db.query('UPDATE usuarios SET role = $1, empresa_id = $2, escola_id = $3 WHERE username = $4', [
        'diretor', fixtureEmpresaId, fixtureSchoolAId, username
      ]);
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

    const inScopeStudent = await db.query(
      'INSERT INTO usuarios(username,email,senha,role,empresa_id,escola_id,verificado) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id',
      [`aluno_local_${suffix}`, inScopeStudentEmail, 'not-a-real-password-hash', 'aluno', fixtureEmpresaId, fixtureSchoolAId]
    );
    const edit = await request(app).put(`/admin/usuario/${inScopeStudent.rows[0].id}`).set(cookie).send({
      username: `aluno_editado_${suffix}`,
      email: inScopeStudentEmail,
      role: 'aluno',
      escola_id: fixtureSchoolAId,
      sala_id: null,
      sala_ids: []
    });
    expect(edit.statusCode).toBe(200);
    const updated = await db.query('SELECT username, role, escola_id FROM usuarios WHERE id=$1', [inScopeStudent.rows[0].id]);
    expect(updated.rows[0]).toMatchObject({ username: `aluno_editado_${suffix}`, role: 'aluno', escola_id: fixtureSchoolAId });
  });

  test('admin consegue mover usuário para outra empresa e ajustar salas atribuídas dentro do escopo', async () => {
    const companyB = await db.query("INSERT INTO empresas(nome) VALUES($1) RETURNING id", [`Empresa B ${suffix}`]);
    fixtureCompanyBId = companyB.rows[0].id;
    const schoolB2 = await db.query('INSERT INTO escolas(empresa_id,nome) VALUES($1,$2) RETURNING id', [companyB.rows[0].id, `Escola B2 ${suffix}`]);
    const periodB2 = await db.query('INSERT INTO periodos(escola_id,nome) VALUES($1,$2) RETURNING id', [schoolB2.rows[0].id, `Período B2 ${suffix}`]);
    const roomB2 = await db.query('INSERT INTO salas(periodo_id,nome) VALUES($1,$2) RETURNING id', [periodB2.rows[0].id, `Sala B2 ${suffix}`]);
    const targetUser = await db.query(
      'INSERT INTO usuarios(username,email,senha,role,empresa_id,escola_id,verificado) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id',
      [`usuario_empresa_${suffix}`, `empresa-user-${suffix}@example.test`, 'not-a-real-password-hash', 'professor', fixtureEmpresaId, fixtureSchoolAId]
    );
    crossCompanyUserId = targetUser.rows[0].id;

    await db.query('UPDATE usuarios SET role = $1 WHERE email = $2', ['formulavest_master', email]);
    const cookie = { Cookie: accessCookie };
    const update = await request(app).put(`/admin/usuario/${targetUser.rows[0].id}`).set(cookie).send({
      username: `usuario_empresa_editado_${suffix}`,
      email: `empresa-user-${suffix}@example.test`,
      role: 'professor',
      empresa_id: companyB.rows[0].id,
      escola_id: schoolB2.rows[0].id,
      sala_id: roomB2.rows[0].id,
      sala_ids: [roomB2.rows[0].id],
      senha: ''
    });

    expect(update.statusCode).toBe(200);
    const result = await db.query('SELECT empresa_id, escola_id, sala_id FROM usuarios WHERE id=$1', [targetUser.rows[0].id]);
    expect(result.rows[0]).toMatchObject({
      empresa_id: companyB.rows[0].id,
      escola_id: schoolB2.rows[0].id,
      sala_id: roomB2.rows[0].id
    });

    const assigned = await db.query('SELECT sala_id FROM professor_salas WHERE professor_id=$1 ORDER BY sala_id', [targetUser.rows[0].id]);
    expect(assigned.rows.map((row) => row.sala_id)).toEqual([roomB2.rows[0].id]);

    await db.query('DELETE FROM professor_salas WHERE professor_id=$1', [targetUser.rows[0].id]);
    await db.query('DELETE FROM usuarios WHERE id=$1', [targetUser.rows[0].id]);
    await db.query('DELETE FROM salas WHERE id=$1', [roomB2.rows[0].id]);
    await db.query('DELETE FROM periodos WHERE id=$1', [periodB2.rows[0].id]);
    await db.query('DELETE FROM escolas WHERE id=$1', [schoolB2.rows[0].id]);
    await db.query('DELETE FROM empresas WHERE id=$1', [companyB.rows[0].id]);
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
        { enunciado: 'Q1', materia: 'Matemática', opcoes: { A: '1' }, correta: 'A' },
        { enunciado: 'Q2', materia: 'Português', opcoes: { A: '2' }, correta: 'B' }
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

    const dashboard = await request(app).get('/dashboard').set(cookie);
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toMatchObject({
      resumo: {
        total_provas: 1,
        acertos: 1,
        questoes: 2,
        percentual_geral: 50,
        melhor_percentual: 50
      }
    });
    expect(dashboard.body.provas).toBeUndefined();

    const grafico = await request(app).get('/grafico').set(cookie);
    expect(grafico.statusCode).toBe(200);
    expect(grafico.body).toMatchObject({
      matematica: 1,
      portugues: 0,
      totais: { matematica: 1, portugues: 1 },
      percentuais: { matematica: 100, portugues: 0 }
    });

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

  test('master pode renomear empresa e filtrar usuários por função e status', async () => {
    const empresa = await db.query('INSERT INTO empresas(nome) VALUES($1) RETURNING id', [`Empresa Mestre ${suffix}`]);
    const escola = await db.query('INSERT INTO escolas(empresa_id,nome) VALUES($1,$2) RETURNING id', [empresa.rows[0].id, `Escola Mestre ${suffix}`]);
    const usuarioAluno = await db.query(
      'INSERT INTO usuarios(username,email,senha,role,empresa_id,escola_id,verificado,banido) VALUES($1,$2,$3,$4,$5,$6,TRUE,FALSE) RETURNING id',
      [`aluno_master_${suffix}`, `master-aluno-${suffix}@example.test`, 'not-a-real-password-hash', 'aluno', empresa.rows[0].id, escola.rows[0].id]
    );
    const usuarioBanido = await db.query(
      'INSERT INTO usuarios(username,email,senha,role,empresa_id,escola_id,verificado,banido) VALUES($1,$2,$3,$4,$5,$6,TRUE,TRUE) RETURNING id',
      [`aluno_banido_${suffix}`, `master-banido-${suffix}@example.test`, 'not-a-real-password-hash', 'aluno', empresa.rows[0].id, escola.rows[0].id]
    );

    await db.query('UPDATE usuarios SET role = $1 WHERE username = $2', ['formulavest_master', username]);
    const { gerarToken } = require('../middlewares/auth');
    const masterUser = await db.query(
      'SELECT id, username, role, empresa_id, escola_id, sala_id, token_version FROM usuarios WHERE username = $1',
      [username]
    );
    const cookie = { Authorization: `Bearer ${gerarToken(masterUser.rows[0])}` };

    const rename = await request(app)
      .put(`/master/empresa/${empresa.rows[0].id}`)
      .set(cookie)
      .send({ nome: `Empresa Mestre Renomeada ${suffix}` });
    expect(rename.statusCode).toBe(200);

    const listing = await request(app)
      .get('/admin/usuarios?role=aluno&status=ativos')
      .set(cookie);
    expect(listing.statusCode).toBe(200);
    expect(listing.body.usuarios.some((user) => user.id === usuarioAluno.rows[0].id)).toBe(true);
    expect(listing.body.usuarios.some((user) => user.id === usuarioBanido.rows[0].id)).toBe(false);

    await db.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [[usuarioAluno.rows[0].id, usuarioBanido.rows[0].id]]);
    await db.query('DELETE FROM escolas WHERE id = $1', [escola.rows[0].id]);
    await db.query('DELETE FROM empresas WHERE id = $1', [empresa.rows[0].id]);
    await db.query('UPDATE usuarios SET role = $1 WHERE email = $2', ['diretor', email]);
  });

  test('cadastro de professor exige sala e registra a atribuição hierárquica', async () => {
    const period = await db.query(
      'INSERT INTO periodos(escola_id,nome) VALUES($1,$2) RETURNING id',
      [fixtureSchoolAId, `Período Professor ${suffix}`]
    );
    const room = await db.query(
      'INSERT INTO salas(periodo_id,nome) VALUES($1,$2) RETURNING id',
      [period.rows[0].id, `Sala Professor ${suffix}`]
    );
    const professorEmail = `professor-hierarquia-${suffix}@example.test`;
    let professorId;

    try {
      await db.query('UPDATE usuarios SET role = $1 WHERE username = $2', ['formulavest_master', username]);
      const { gerarToken } = require('../middlewares/auth');
      const adminUser = await db.query(
        'SELECT id, username, role, empresa_id, escola_id, sala_id, token_version FROM usuarios WHERE username = $1',
        [username]
      );
      const authorization = `Bearer ${gerarToken(adminUser.rows[0])}`;
      const payload = {
        username: `prof_hierarquia_${suffix}`,
        email: professorEmail,
        senha: 'senha-de-teste-123',
        role: 'professor',
        empresa_id: fixtureEmpresaId,
        escola_id: fixtureSchoolAId
      };

      const missingRoom = await request(app).post('/admin/criar-usuario').set('Authorization', authorization).send(payload);
      expect(missingRoom.statusCode).toBe(400);

      const created = await request(app).post('/admin/criar-usuario').set('Authorization', authorization).send({
        ...payload,
        sala_id: room.rows[0].id
      });
      expect(created.statusCode).toBe(200);

      const professor = await db.query('SELECT id, username, role, empresa_id, escola_id, sala_id, token_version FROM usuarios WHERE email = $1', [professorEmail]);
      professorId = professor.rows[0].id;
      expect(professor.rows[0]).toMatchObject({
        empresa_id: fixtureEmpresaId,
        escola_id: fixtureSchoolAId,
        sala_id: room.rows[0].id
      });

      const assignment = await db.query('SELECT sala_id FROM professor_salas WHERE professor_id = $1', [professorId]);
      expect(assignment.rows.map((row) => row.sala_id)).toEqual([room.rows[0].id]);

      const professorToken = gerarToken({
        ...professor.rows[0],
        role: 'professor'
      });
      const periods = await request(app).get('/professor/periodos').set('Authorization', `Bearer ${professorToken}`);
      const rooms = await request(app).get('/professor/salas').set('Authorization', `Bearer ${professorToken}`);
      expect(periods.statusCode).toBe(200);
      expect(periods.body.periodos[0]).toMatchObject({ escola_nome: expect.any(String), empresa_nome: expect.any(String) });
      expect(rooms.statusCode).toBe(200);
      expect(rooms.body.salas[0]).toMatchObject({ escola_nome: expect.any(String), empresa_nome: expect.any(String) });
    } finally {
      if (professorId) {
        await db.query('DELETE FROM professor_salas WHERE professor_id = $1', [professorId]);
        await db.query('DELETE FROM usuarios WHERE id = $1', [professorId]);
      }
      await db.query('DELETE FROM salas WHERE id = $1', [room.rows[0].id]);
      await db.query('DELETE FROM periodos WHERE id = $1', [period.rows[0].id]);
    }
  });

});
