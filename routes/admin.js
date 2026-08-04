module.exports = function registerAdminRoutes(app, deps = {}) {
  const { auth, bcrypt, db, enviarEmail, permitir } = deps;

  const nivelRole = {
    formulavest_master: 5,
    empresa_admin: 4,
    diretor: 3,
    coordenador: 2,
    professor: 1,
    aluno: 0
  };

  function slugify(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async function buscarPeriodoParaUsuario(req, periodoId, periodoNome, escolaId) {
    if (periodoId) {
      const r = await db.query('SELECT * FROM periodos WHERE id=$1', [periodoId]);
      if (r.rows.length === 0) throw new Error('Período inválido');
      return r.rows[0];
    }

    if (!periodoNome) throw new Error('Período não informado');

    // find or create
    const escola = await db.query('SELECT * FROM escolas WHERE id=$1', [escolaId]);
    if (escola.rows.length === 0) throw new Error('Escola inválida');

    const found = await db.query('SELECT * FROM periodos WHERE escola_id=$1 AND LOWER(nome)=LOWER($2)', [escolaId, periodoNome]);
    if (found.rows.length) return found.rows[0];

    const ins = await db.query('INSERT INTO periodos(escola_id,nome) VALUES($1,$2) RETURNING *', [escolaId, periodoNome]);
    return ins.rows[0];
  }

  async function buscarSalaParaPeriodo(periodoId, salaId, salaNome) {
    if (salaId) {
      const r = await db.query('SELECT * FROM salas WHERE id=$1', [salaId]);
      if (r.rows.length === 0) throw new Error('Sala inválida');
      return r.rows[0];
    }

    if (!salaNome) throw new Error('Sala não informada');

    const found = await db.query('SELECT * FROM salas WHERE periodo_id=$1 AND LOWER(nome)=LOWER($2)', [periodoId, salaNome]);
    if (found.rows.length) return found.rows[0];

    const ins = await db.query('INSERT INTO salas(periodo_id,nome) VALUES($1,$2) RETURNING *', [periodoId, salaNome]);
    return ins.rows[0];
  }

  async function criarAlunoNoSistema(req, dados) {
    const {
      nome,
      email,
      senha,
      periodo_id,
      sala_id,
      periodo_nome,
      sala_nome,
      escola_id
    } = dados;

    if (!nome || nome.trim().length < 3) throw new Error('Nome do aluno inválido');

    if (!escola_id) throw new Error('Escola obrigatória');

    const periodo = await buscarPeriodoParaUsuario(req, periodo_id, periodo_nome, escola_id);
    const sala = await buscarSalaParaPeriodo(periodo.id, sala_id, sala_nome);

    const emailNorm = (email || `${slugify(nome)}@formulavest.local`).toLowerCase().trim();
    const senhaFinal = senha || 'Aluno1234';
    const username = nome.trim();

    const existe = await db.query('SELECT id FROM usuarios WHERE email=$1 OR username=$2', [emailNorm, username]);
    if (existe.rows.length > 0) throw new Error('Aluno já existe com esse email ou nome');

    const hash = await bcrypt.hash(senhaFinal, 10);

    await db.query(`INSERT INTO usuarios (username,email,senha,role,empresa_id,escola_id,sala_id,verificado) VALUES ($1,$2,$3,'aluno',$4,$5,$6,TRUE)`, [username, emailNorm, hash, periodo.empresa_id, periodo.escola_id, sala.id]);

    return { ok: true };
  }

  function podeGerenciarUsuario(req, alvo) {
    if (req.user.role === 'formulavest_master') return true;
    if (alvo.empresa_id !== req.user.empresa_id) return false;
    if (req.user.role === 'coordenador' && !['professor', 'aluno'].includes(alvo.role)) return false;
    return (nivelRole[req.user.role] || 0) > (nivelRole[alvo.role] || 0);
  }

  function podeCriarRole(req, role) {
    if (!role || !Object.prototype.hasOwnProperty.call(nivelRole, role)) return false;
    if (req.user.role === 'formulavest_master') return role !== 'formulavest_master';
    if (req.user.role === 'coordenador') return ['professor', 'aluno'].includes(role);
    return (nivelRole[req.user.role] || 0) > (nivelRole[role] || 0);
  }

  async function carregarSalaComContexto(salaId) {
    const result = await db.query(`SELECT s.*, p.escola_id, e.empresa_id FROM salas s JOIN periodos p ON p.id = s.periodo_id JOIN escolas e ON e.id = p.escola_id WHERE s.id = $1`, [salaId]);
    return result.rows[0];
  }

  // admin-check
  app.get('/admin-check', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), (_, res) => res.json({ ok: true }));

  // admin/provas with pagination
  app.get('/admin/provas', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;
      const q = (req.query.q || '').toString().trim();

      const baseJoin = `FROM provas p JOIN usuarios u ON u.id = p.usuario_id`;
      const where = [];
      const params = [];

      if (req.user.role === 'empresa_admin') {
        params.push(req.user.empresa_id);
        where.push(`u.empresa_id = $${params.length}`);
      } else if (req.user.role !== 'formulavest_master') {
        params.push(req.user.escola_id);
        where.push(`u.escola_id = $${params.length}`);
      }

      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        where.push(`(LOWER(u.username) LIKE $${params.length} OR LOWER(p.titulo) LIKE $${params.length})`);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const totalRes = await db.query(`SELECT COUNT(*) as count ${baseJoin} ${whereClause}`, params);
      const total = Number(totalRes.rows[0].count || 0);

      params.push(limit);
      params.push(offset);
      const provasRes = await db.query(`SELECT p.*, u.username ${baseJoin} ${whereClause} ORDER BY p.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

      res.json({ provas: provasRes.rows, total, page, limit });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro provas' });
    }
  });

  // admin/usuarios with pagination
  app.get('/admin/usuarios', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;
      const q = (req.query.q || '').toString().trim();

      const where = [];
      const params = [];

      if (req.user.role === 'empresa_admin') {
        params.push(req.user.empresa_id);
        where.push(`empresa_id = $${params.length}`);
      } else if (req.user.role === 'diretor') {
        params.push(req.user.escola_id);
        where.push(`escola_id = $${params.length}`);
      } else if (req.user.role === 'coordenador') {
        params.push(req.user.escola_id);
        where.push(`escola_id = $${params.length}`);
        where.push(`role IN ('professor','aluno')`);
      }

      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        where.push(`(LOWER(username) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(role) LIKE $${params.length})`);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const totalResult = await db.query(`SELECT COUNT(*) as count FROM usuarios ${whereClause}`, params);
      const total = Number(totalResult.rows[0].count || 0);

      params.push(limit);
      params.push(offset);
      const usersResult = await db.query(`SELECT * FROM usuarios ${whereClause} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      const users = usersResult.rows;

      const userIds = users.map((user) => user.id);
      let assignedMap = new Map();

      if (userIds.length) {
        const assignedResult = await db.query(`
          SELECT ps.professor_id, s.id AS sala_id, s.nome AS sala_nome, p.id AS periodo_id, p.nome AS periodo_nome
          FROM professor_salas ps
          JOIN salas s ON s.id = ps.sala_id
          JOIN periodos p ON p.id = s.periodo_id
          WHERE ps.professor_id = ANY($1::int[])
        `, [userIds]);

        assignedResult.rows.forEach((row) => {
          if (!assignedMap.has(row.professor_id)) {
            assignedMap.set(row.professor_id, []);
          }
          assignedMap.get(row.professor_id).push({
            id: row.sala_id,
            nome: row.sala_nome,
            periodo_id: row.periodo_id,
            periodo_nome: row.periodo_nome
          });
        });
      }

      const usuarios = users.map((user) => ({
        ...user,
        assigned_salas: assignedMap.get(user.id) || []
      }));

      res.json({ usuarios, total, page, limit });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro listar usuários' });
    }
  });

  app.put('/admin/usuario/:id', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: 'ID invalido' });

      const targetRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
      if (targetRes.rows.length === 0) return res.status(404).json({ error: 'Usuario nao encontrado' });
      const alvo = targetRes.rows[0];
      if (!podeGerenciarUsuario(req, alvo)) return res.status(403).json({ error: 'Sem permissao' });

      const username = String(req.body.username || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const role = String(req.body.role || '').trim();
      const escolaId = req.body.escola_id ? Number(req.body.escola_id) : null;
      const salaId = req.body.sala_id ? Number(req.body.sala_id) : null;
      const salaIds = Array.isArray(req.body.sala_ids) ? req.body.sala_ids.map(Number).filter(Boolean) : null;
      const senha = req.body.senha ? String(req.body.senha) : null;

      if (!username || username.length < 3) return res.status(400).json({ error: 'Username invalido' });
      if (!email) return res.status(400).json({ error: 'Email obrigatorio' });
      if (!podeCriarRole(req, role)) return res.status(403).json({ error: 'Sem permissao para essa funcao' });
      if (senha && senha.length < 8) return res.status(400).json({ error: 'Senha muito curta' });

      const conflict = await db.query('SELECT id FROM usuarios WHERE (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)) AND id <> $3', [email, username, id]);
      if (conflict.rows.length) return res.status(400).json({ error: 'Email ou username ja em uso' });

      let finalEscolaId = escolaId;
      let finalSalaId = salaId;

      if (salaId) {
        const salaRes = await db.query('SELECT s.id, s.periodo_id, p.escola_id, e.empresa_id FROM salas s JOIN periodos p ON p.id = s.periodo_id JOIN escolas e ON e.id = p.escola_id WHERE s.id = $1', [salaId]);
        if (salaRes.rows.length === 0) return res.status(404).json({ error: 'Sala invalida' });
        const sala = salaRes.rows[0];
        if (req.user.role !== 'formulavest_master' && sala.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao para esta sala' });
        if (finalEscolaId && sala.escola_id !== finalEscolaId) return res.status(400).json({ error: 'Escola e sala inconsistente' });
        finalEscolaId = sala.escola_id;
      }

      if (salaIds && salaIds.length) {
        const salasRes = await db.query(`
          SELECT s.id, p.escola_id, e.empresa_id
          FROM salas s
          JOIN periodos p ON p.id = s.periodo_id
          JOIN escolas e ON e.id = p.escola_id
          WHERE s.id = ANY($1::int[])
        `, [salaIds]);

        if (salasRes.rows.length !== salaIds.length) return res.status(404).json({ error: 'Uma ou mais salas atribuídas são inválidas' });
        if (req.user.role !== 'formulavest_master') {
          const invalid = salasRes.rows.some((s) => s.empresa_id !== req.user.empresa_id);
          if (invalid) return res.status(403).json({ error: 'Sem permissao para atribuir uma ou mais salas' });
        }
      }

      if (finalEscolaId) {
        const escolaRes = await db.query('SELECT id, empresa_id FROM escolas WHERE id = $1', [finalEscolaId]);
        if (escolaRes.rows.length === 0) return res.status(404).json({ error: 'Escola invalida' });
        const escola = escolaRes.rows[0];
        if (req.user.role !== 'formulavest_master' && escola.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao para esta escola' });
      }

      const updates = ['username', 'email', 'role', 'escola_id', 'sala_id'];
      const params = [username, email, role, finalEscolaId, finalSalaId, id];
      let query = 'UPDATE usuarios SET username = $1, email = $2, role = $3, escola_id = $4, sala_id = $5';

      if (senha) {
        const hash = await bcrypt.hash(senha, 10);
        params.splice(5, 0, hash);
        query += ', senha = $6';
        query += ' WHERE id = $7';
      } else {
        query += ' WHERE id = $6';
      }

      await db.query(query, params);

      if (Array.isArray(salaIds)) {
        await db.query('DELETE FROM professor_salas WHERE professor_id = $1', [id]);
        if (salaIds.length) {
          for (const assignedSalaId of salaIds) {
            await db.query('INSERT INTO professor_salas (professor_id, sala_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, assignedSalaId]);
          }
        }
      } else if (role !== 'professor') {
        await db.query('DELETE FROM professor_salas WHERE professor_id = $1', [id]);
      }

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro atualizar usuario' });
    }
  });

  app.put('/admin/usuario/:id/banir', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: 'ID invalido' });

      const targetRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
      if (targetRes.rows.length === 0) return res.status(404).json({ error: 'Usuario nao encontrado' });
      const alvo = targetRes.rows[0];
      if (!podeGerenciarUsuario(req, alvo)) return res.status(403).json({ error: 'Sem permissao' });

      await db.query('UPDATE usuarios SET banido = NOT COALESCE(banido, FALSE) WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro banir usuario' });
    }
  });

  app.delete('/admin/usuario/:id', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: 'ID invalido' });

      const targetRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
      if (targetRes.rows.length === 0) return res.status(404).json({ error: 'Usuario nao encontrado' });
      const alvo = targetRes.rows[0];
      if (!podeGerenciarUsuario(req, alvo)) return res.status(403).json({ error: 'Sem permissao' });

      await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro excluir usuario' });
    }
  });

  // admin stats
  app.get('/admin/stats', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const where = [];
      const params = [];
      const baseJoin = 'FROM provas p JOIN usuarios u ON u.id = p.usuario_id';

      if (req.user.role === 'empresa_admin') {
        params.push(req.user.empresa_id);
        where.push(`u.empresa_id = $${params.length}`);
      } else if (req.user.role === 'diretor' || req.user.role === 'coordenador') {
        params.push(req.user.escola_id);
        where.push(`u.escola_id = $${params.length}`);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const totalRes = await db.query(`SELECT COUNT(*) AS count ${baseJoin} ${whereClause}`, params);
      const mediaRes = await db.query(`SELECT AVG(p.acertos) AS media ${baseJoin} ${whereClause}`, params);
      const rankRes = await db.query(`SELECT u.username AS label, SUM(p.acertos) AS value ${baseJoin} ${whereClause} GROUP BY u.id, u.username ORDER BY value DESC LIMIT 8`, params);

      res.json({
        totalProvas: Number(totalRes.rows[0].count || 0),
        media: Number(mediaRes.rows[0].media || 0).toFixed(1),
        labels: rankRes.rows.map(r => r.label),
        values: rankRes.rows.map(r => Number(r.value || 0))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao calcular estatísticas' });
    }
  });

  app.get('/admin/escolas', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      let query = 'SELECT * FROM escolas';
      const params = [];
      if (req.user.role === 'empresa_admin') {
        query += ' WHERE empresa_id = $1';
        params.push(req.user.empresa_id);
      } else if (req.user.role === 'diretor' || req.user.role === 'coordenador') {
        query += ' WHERE id = $1';
        params.push(req.user.escola_id);
      }
      const result = await db.query(`${query} ORDER BY id DESC`, params);
      res.json({ escolas: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro listar escolas' });
    }
  });

  // criar aluno
  app.post('/admin/criar-aluno', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const { nome, email, senha, periodo_id, sala_id, periodo_nome, sala_nome, escola_id } = req.body;
      await criarAlunoNoSistema(req, { nome, email, senha, periodo_id, sala_id, periodo_nome, sala_nome, escola_id });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message || 'Erro criar aluno' });
    }
  });

  app.post('/admin/criar-escola', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const nome = String(req.body.nome || '').trim();
      if (!nome) return res.status(400).json({ error: 'Nome da escola obrigatorio' });

      let empresaId = req.user.empresa_id;
      if (req.user.role === 'formulavest_master') {
        empresaId = Number(req.body.empresa_id || empresaId);
      }
      if (!empresaId) return res.status(400).json({ error: 'Empresa obrigatoria' });

      const exists = await db.query('SELECT id FROM escolas WHERE empresa_id = $1 AND LOWER(nome) = LOWER($2)', [empresaId, nome]);
      if (exists.rows.length) return res.status(400).json({ error: 'Escola ja existe' });

      const result = await db.query('INSERT INTO escolas(empresa_id,nome) VALUES($1,$2) RETURNING *', [empresaId, nome]);
      res.json({ escola: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro criar escola' });
    }
  });

  app.post('/admin/criar-periodo', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const escolaId = Number(req.body.escola_id || 0);
      const nome = String(req.body.nome || '').trim();
      if (!escolaId || !nome) return res.status(400).json({ error: 'Escola e nome do periodo obrigatorios' });

      const escola = await db.query('SELECT * FROM escolas WHERE id = $1', [escolaId]);
      if (escola.rows.length === 0) return res.status(404).json({ error: 'Escola nao encontrada' });
      if (req.user.role !== 'formulavest_master' && escola.rows[0].empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });

      const exists = await db.query('SELECT id FROM periodos WHERE escola_id = $1 AND LOWER(nome) = LOWER($2)', [escolaId, nome]);
      if (exists.rows.length) return res.status(400).json({ error: 'Periodo ja existe' });

      const result = await db.query('INSERT INTO periodos(escola_id,nome) VALUES($1,$2) RETURNING *', [escolaId, nome]);
      res.json({ periodo: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro criar periodo' });
    }
  });

  app.post('/admin/criar-sala', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const periodoId = Number(req.body.periodo_id || 0);
      const nome = String(req.body.nome || '').trim();
      if (!periodoId || !nome) return res.status(400).json({ error: 'Periodo e nome da sala obrigatorios' });

      const periodo = await db.query('SELECT p.*, e.empresa_id FROM periodos p JOIN escolas e ON e.id = p.escola_id WHERE p.id = $1', [periodoId]);
      if (periodo.rows.length === 0) return res.status(404).json({ error: 'Periodo nao encontrado' });
      if (req.user.role !== 'formulavest_master' && periodo.rows[0].empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });

      const exists = await db.query('SELECT id FROM salas WHERE periodo_id = $1 AND LOWER(nome) = LOWER($2)', [periodoId, nome]);
      if (exists.rows.length) return res.status(400).json({ error: 'Sala ja existe' });

      const result = await db.query('INSERT INTO salas(periodo_id,nome) VALUES($1,$2) RETURNING *', [periodoId, nome]);
      res.json({ sala: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro criar sala' });
    }
  });

  // importar alunos (bulk)
  app.post('/admin/importar-alunos', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const { alunos = [] } = req.body;
      if (!Array.isArray(alunos) || alunos.length === 0) return res.status(400).json({ error: 'Nenhum aluno informado' });
      const criados = [];
      const erros = [];
      for (const [index, item] of alunos.entries()) {
        try {
          const nome = String(item.nome || item['nome do aluno'] || item.nome_do_aluno || '').trim();
          const periodoNome = String(item.periodo || item.periodo_nome || item['periodo'] || '').trim();
          const salaNome = String(item.sala || item.sala_nome || item['sala'] || '').trim();
          if (!nome || !periodoNome || !salaNome) throw new Error('Nome, período e sala são obrigatórios');
          await criarAlunoNoSistema(req, { nome, email: item.email || item['email'], senha: item.senha || item['senha'], periodo_nome: periodoNome, sala_nome: salaNome, escola_id: item.escola_id || item.escolaId || null });
          criados.push({ nome, periodo: periodoNome, sala: salaNome });
        } catch (err) {
          erros.push({ linha: index + 2, erro: err.message || 'Erro ao criar aluno' });
        }
      }
      res.json({ ok: true, criados: criados.length, erros });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro importar alunos' });
    }
  });

  // criar usuario
  app.post('/admin/criar-usuario', auth, permitir('formulavest_master', 'empresa_admin', 'diretor', 'coordenador'), async (req, res) => {
    try {
      const { username, email, senha, role, escola_id, sala_id } = req.body;
      if (!username || username.length < 3) return res.status(400).json({ error: 'Username inválido' });
      if (!email) return res.status(400).json({ error: 'Email obrigatorio' });
      if (!senha || senha.length < 8) return res.status(400).json({ error: 'Senha muito curta' });
      if (!podeCriarRole(req, role)) return res.status(403).json({ error: 'Sem permissao para criar essa funcao' });

      const emailNorm = email.toLowerCase().trim();
      const existe = await db.query('SELECT id FROM usuarios WHERE email=$1 OR username=$2', [emailNorm, username]);
      if (existe.rows.length > 0) return res.status(400).json({ error: 'Usuário já existe' });

      const hash = await bcrypt.hash(senha, 10);
      let empresaId = req.user.empresa_id;
      let escolaId = escola_id;
      if (req.user.role === 'formulavest_master') empresaId = req.body.empresa_id || req.user.empresa_id;
      if (!empresaId) return res.status(400).json({ error: 'Empresa obrigatoria' });
      if (req.user.role === 'diretor') escolaId = req.user.escola_id;
      if (req.user.role === 'coordenador') {
        if (!['aluno', 'professor'].includes(role)) return res.status(403).json({ error: 'Sem permissão' });
        escolaId = req.user.escola_id;
      }

      await db.query(`INSERT INTO usuarios(username,email,senha,role,empresa_id,escola_id,sala_id,verificado) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`, [username, emailNorm, hash, role, empresaId, escolaId, sala_id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro criar usuário' });
    }
  });

  // small helper endpoints (periodos, salas, escolas)
  app.get('/admin/periodos/:escolaId', auth, permitir('formulavest_master','empresa_admin','diretor','coordenador'), async (req, res) => {
    try {
      const escolaId = req.params.escolaId;
      const escola = await db.query('SELECT * FROM escolas WHERE id=$1', [escolaId]);
      if (escola.rows.length === 0) return res.status(404).json({ error: 'Escola não encontrada' });
      const esc = escola.rows[0];
      if (req.user.role !== 'formulavest_master' && esc.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissão' });
      const result = await db.query('SELECT * FROM periodos WHERE escola_id=$1 ORDER BY id DESC', [escolaId]);
      res.json({ periodos: result.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro listar períodos' }); }
  });

  app.get('/admin/salas/:periodoId', auth, permitir('formulavest_master','empresa_admin','diretor','coordenador','professor'), async (req, res) => {
    try {
      const periodoId = req.params.periodoId;
      const periodo = await db.query('SELECT p.*, e.empresa_id FROM periodos p JOIN escolas e ON e.id = p.escola_id WHERE p.id = $1', [periodoId]);
      const p = periodo.rows[0]; if (!p) return res.status(404).json({ error: 'Periodo nao encontrado' });
      if (req.user.role !== 'formulavest_master' && p.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });
      const result = await db.query('SELECT * FROM salas WHERE periodo_id = $1 ORDER BY id DESC', [periodoId]);
      res.json({ salas: result.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro listar salas' }); }
  });

  app.put('/admin/escola/:id', auth, permitir('formulavest_master','empresa_admin','diretor','coordenador'), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      const nome = String(req.body.nome || '').trim();
      if (!id || !nome) return res.status(400).json({ error: 'ID e nome obrigatorios' });

      const escolaRes = await db.query('SELECT * FROM escolas WHERE id = $1', [id]);
      if (escolaRes.rows.length === 0) return res.status(404).json({ error: 'Escola nao encontrada' });
      const escola = escolaRes.rows[0];
      if (req.user.role !== 'formulavest_master' && escola.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });

      const conflict = await db.query('SELECT id FROM escolas WHERE empresa_id = $1 AND LOWER(nome) = LOWER($2) AND id <> $3', [escola.empresa_id, nome, id]);
      if (conflict.rows.length) return res.status(400).json({ error: 'Ja existe outra escola com esse nome' });

      await db.query('UPDATE escolas SET nome = $1 WHERE id = $2', [nome, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro atualizar escola' });
    }
  });

  app.put('/admin/periodo/:id', auth, permitir('formulavest_master','empresa_admin','diretor','coordenador'), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      const nome = String(req.body.nome || '').trim();
      if (!id || !nome) return res.status(400).json({ error: 'ID e nome obrigatorios' });

      const periodoRes = await db.query('SELECT p.*, e.empresa_id FROM periodos p JOIN escolas e ON e.id = p.escola_id WHERE p.id = $1', [id]);
      if (periodoRes.rows.length === 0) return res.status(404).json({ error: 'Periodo nao encontrado' });
      const periodo = periodoRes.rows[0];
      if (req.user.role !== 'formulavest_master' && periodo.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });

      const conflict = await db.query('SELECT id FROM periodos WHERE escola_id = $1 AND LOWER(nome) = LOWER($2) AND id <> $3', [periodo.escola_id, nome, id]);
      if (conflict.rows.length) return res.status(400).json({ error: 'Ja existe outro periodo com esse nome' });

      await db.query('UPDATE periodos SET nome = $1 WHERE id = $2', [nome, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro atualizar periodo' });
    }
  });

  app.put('/admin/sala/:id', auth, permitir('formulavest_master','empresa_admin','diretor','coordenador'), async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      const nome = String(req.body.nome || '').trim();
      if (!id || !nome) return res.status(400).json({ error: 'ID e nome obrigatorios' });

      const salaRes = await db.query(
        'SELECT s.*, p.id AS periodo_id, p.escola_id, e.empresa_id FROM salas s JOIN periodos p ON p.id = s.periodo_id JOIN escolas e ON e.id = p.escola_id WHERE s.id = $1',
        [id]
      );
      if (salaRes.rows.length === 0) return res.status(404).json({ error: 'Sala nao encontrada' });
      const sala = salaRes.rows[0];
      if (req.user.role !== 'formulavest_master' && sala.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });

      const conflict = await db.query('SELECT id FROM salas WHERE periodo_id = $1 AND LOWER(nome) = LOWER($2) AND id <> $3', [sala.periodo_id, nome, id]);
      if (conflict.rows.length) return res.status(400).json({ error: 'Ja existe outra sala com esse nome neste periodo' });

      await db.query('UPDATE salas SET nome = $1 WHERE id = $2', [nome, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro atualizar sala' });
    }
  });

  // master stats and companies
  app.get('/master/stats', auth, permitir('formulavest_master'), async (req, res) => {
    try {
      const totalEmpresasRes = await db.query('SELECT COUNT(*) AS count FROM empresas');
      const totalUsuariosRes = await db.query('SELECT COUNT(*) AS count FROM usuarios');
      const totalProvasRes = await db.query('SELECT COUNT(*) AS count FROM provas');
      res.json({
        totalEmpresas: Number(totalEmpresasRes.rows[0].count || 0),
        totalUsuarios: Number(totalUsuariosRes.rows[0].count || 0),
        totalProvas: Number(totalProvasRes.rows[0].count || 0)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro buscar estatísticas master' });
    }
  });

  app.get('/master/empresas', auth, permitir('formulavest_master'), async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM empresas ORDER BY id DESC');
      res.json({ empresas: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro listar empresas' });
    }
  });

  app.post('/master/criar-empresa', auth, permitir('formulavest_master'), async (req, res) => {
    try {
      const nome = String(req.body.nome || '').trim();
      if (!nome) return res.status(400).json({ error: 'Nome da empresa obrigatorio' });
      const exists = await db.query('SELECT id FROM empresas WHERE LOWER(nome) = LOWER($1)', [nome]);
      if (exists.rows.length) return res.status(400).json({ error: 'Empresa ja existe' });
      const result = await db.query('INSERT INTO empresas(nome) VALUES($1) RETURNING *', [nome]);
      res.json({ empresa: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro criar empresa' });
    }
  });

  app.post('/master/criar-admin', auth, permitir('formulavest_master'), async (req, res) => {
    try {
      const username = String(req.body.username || '').trim();
      const email = String(req.body.email || '').trim();
      const senha = String(req.body.senha || '');
      const empresaId = Number(req.body.empresa_id || 0);

      if (!username || !email || !senha) return res.status(400).json({ error: 'Username, email e senha obrigatorios' });
      if (senha.length < 8) return res.status(400).json({ error: 'Senha muito curta' });
      if (!empresaId) return res.status(400).json({ error: 'Empresa obrigatoria' });

      const exists = await db.query('SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)', [email, username]);
      if (exists.rows.length) return res.status(400).json({ error: 'Usuario ja existe' });

      const hash = await bcrypt.hash(senha, 10);
      const user = await db.query('INSERT INTO usuarios(username,email,senha,role,empresa_id,verificado) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING *', [username, email.toLowerCase(), hash, 'empresa_admin', empresaId]);
      res.json({ usuario: user.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro criar admin da empresa' });
    }
  });

  app.delete('/master/empresa/:id', auth, permitir('formulavest_master'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID invalido' });
      await db.query('DELETE FROM empresas WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro excluir empresa' });
    }
  });

  // export helpers for tests if needed
  app.locals.adminHelpers = { slugify, criarAlunoNoSistema, buscarPeriodoParaUsuario, buscarSalaParaPeriodo };
};
