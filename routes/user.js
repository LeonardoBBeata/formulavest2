module.exports = function registerUserRoutes(app, deps = {}) {
  const { auth, bcrypt, db, upload } = deps;

app.post("/add-xp", auth, async (req, res) => {
  try {
    const xp = Number(req.body.xp || 0);

    if (xp <= 0) {
      return res.status(400).json({ error: "XP inválido" });
    }

    const result = await db.query(`
      UPDATE usuarios
      SET 
        xp = xp + $1,
        nivel = FLOOR((xp + $1) / 100) + 1
      WHERE id = $2
      RETURNING xp, nivel
    `, [xp, req.user.id]);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro XP" });
  }
});

//=======================
// ROLES
//=======================
app.get("/me", auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, username, email, foto, role, xp, nivel
      FROM usuarios
      WHERE id = $1
    `, [req.user.id]);

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      foto: user.foto || "/default.png",
      role: user.role,
      xp: user.xp,
      nivel: user.nivel
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro /me" });
  }
});

app.get('/me/conquistas', auth, async (req, res) => {
  try {
    if (req.user.role !== 'aluno') {
      return res.json({
        conquistas: {},
        total: 0,
        nivel: req.user.nivel || 1,
        historico: []
      });
    }

    const userId = req.user.id;

    // total provas finalizadas
    const totalRes = await db.query(`SELECT COUNT(*) as count FROM respostas_provas_professor WHERE aluno_id = $1`, [userId]);
    const total = Number(totalRes.rows[0].count || 0);

    // nivel
    const u = await db.query(`SELECT nivel, last_active FROM usuarios WHERE id=$1`, [userId]);
    const nivel = u.rows[0]?.nivel || 1;
    const lastActive = u.rows[0]?.last_active ? new Date(u.rows[0].last_active) : null;

    // simple streak calculation: count distinct days with finalizada_em up to today consecutively
    const datesRes = await db.query(`
      SELECT DISTINCT DATE(finalizada_em) as d
      FROM respostas_provas_professor
      WHERE aluno_id = $1
      AND finalizada_em IS NOT NULL
      ORDER BY d DESC
      LIMIT 365
    `, [userId]);

    const dates = datesRes.rows.map(r => r.d).map(d => new Date(d));
    let streak = 0;
    if (dates.length > 0) {
      let expected = new Date();
      expected.setHours(0,0,0,0);
      for (let i = 0; i < dates.length; i++) {
        const dt = new Date(dates[i]); dt.setHours(0,0,0,0);
        if (dt.getTime() === expected.getTime()) {
          streak++;
          expected.setDate(expected.getDate() - 1);
        } else if (dt.getTime() < expected.getTime()) {
          break;
        }
      }
    }

    const conquistas = {
      primeira_prova: total >= 1,
      dez_provas: total >= 10,
      cinquenta_provas: total >= 50,
      nivel_10: nivel >= 10,
      streak_7: streak >= 7,
      streak_days: streak,
      last_active: lastActive
    };

    // mapeamento de títulos/descrições para histórico
    const mapa = {
      primeira_prova: { titulo: 'Primeira prova', descricao: 'Concluiu a primeira prova' },
      dez_provas: { titulo: '10 provas', descricao: 'Concluiu 10 provas' },
      cinquenta_provas: { titulo: '50 provas', descricao: 'Concluiu 50 provas' },
      nivel_10: { titulo: 'Nível 10', descricao: 'Alcançou o nível 10' },
      streak_7: { titulo: 'Sequência 7 dias', descricao: 'Finalizou provas por 7 dias consecutivos' }
    };

    // buscar conquistas já gravadas
    const existingRes = await db.query(`SELECT chave FROM conquistas_historico WHERE usuario_id = $1`, [userId]);
    const existing = new Set(existingRes.rows.map(r => r.chave));

    // inserir novas conquistas no histórico
    for (const key of Object.keys(mapa)) {
      if (conquistas[key] && !existing.has(key)) {
        const meta = {};
        if (key === 'dez_provas') meta.count = 10;
        if (key === 'cinquenta_provas') meta.count = 50;
        if (key === 'streak_7') meta.days = streak;
        try {
          await db.query(`INSERT INTO conquistas_historico(usuario_id, chave, titulo, descricao, meta) VALUES($1,$2,$3,$4,$5)`, [userId, key, mapa[key].titulo, mapa[key].descricao, meta]);
        } catch (e) {
          console.error('Erro gravar conquista', key, e);
        }
      }
    }

    // retornar também o histórico recente
    const hist = await db.query(`SELECT id, chave, titulo, descricao, meta, criado_em FROM conquistas_historico WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 100`, [userId]);

    res.json({ conquistas, total, nivel, historico: hist.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro conquistas' });
  }
});

// listar histórico completo de conquistas do usuário
app.get('/me/conquistas/historico', auth, async (req, res) => {
  try {
    if (req.user.role !== 'aluno') {
      return res.json({ historico: [] });
    }

    const userId = req.user.id;
    const hist = await db.query(`SELECT id, chave, titulo, descricao, meta, criado_em FROM conquistas_historico WHERE usuario_id = $1 ORDER BY criado_em DESC`, [userId]);
    res.json({ historico: hist.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro historico conquistas' });
  }
});

app.post("/upload-foto", auth, upload.single("foto"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada" });
    }

    const fotoUrl = `/uploads/${req.file.filename}`;

    await db.query(`
      UPDATE usuarios
      SET foto = $1
      WHERE id = $2
    `, [fotoUrl, req.user.id]);

    return res.json({
      ok: true,
      foto: fotoUrl
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro upload foto" });
  }
});

app.put("/atualizar-perfil", auth, async (req, res) => {
  try {
    const { nome, email, senha, foto } = req.body;

    const userResult = await db.query(`
      SELECT * FROM usuarios WHERE id = $1
    `, [req.user.id]);

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    let novoNome = nome || user.username;
    let novoEmail = email || user.email;
    let novaFoto = foto || user.foto;

    let novaSenha = user.senha;

    if (senha && senha.length >= 8) {
      novaSenha = await bcrypt.hash(senha, 10);
    }

    await db.query(`
      UPDATE usuarios
      SET
        username = $1,
        email = $2,
        senha = $3,
        foto = $4
      WHERE id = $5
    `, [
      novoNome,
      novoEmail,
      novaSenha,
      novaFoto,
      req.user.id
    ]);

    res.json({
      ok: true,
      nome: novoNome,
      email: novoEmail,
      foto: novaFoto
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

app.put("/trocar-senha", auth, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
      return res.status(400).json({ error: "Senha atual e nova senha sao obrigatorias" });
    }

    if (nova_senha.length < 8) {
      return res.status(400).json({ error: "Nova senha deve ter no minimo 8 caracteres" });
    }

    const result = await db.query(`
      SELECT senha
      FROM usuarios
      WHERE id = $1
    `, [req.user.id]);

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "Usuario nao encontrado" });
    }

    const senhaOk = await bcrypt.compare(senha_atual, user.senha);

    if (!senhaOk) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    const hash = await bcrypt.hash(nova_senha, 10);

    await db.query(`
      UPDATE usuarios
      SET senha = $1
      WHERE id = $2
    `, [hash, req.user.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro trocar senha" });
  }
});
};
