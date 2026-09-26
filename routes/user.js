const fs = require('fs');
const crypto = require('crypto');

module.exports = function registerUserRoutes(app, deps = {}) {
  const { auth, authLimiter, bcrypt, db, enviarEmail, upload, validator } = deps;

// XP is awarded only by server-side completion flows. Accepting a client supplied
// amount allowed any authenticated user to manipulate the ranking.
app.post("/add-xp", auth, (_, res) => {
  res.status(403).json({ error: "XP é atribuído automaticamente ao finalizar provas" });
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

    const provasRes = await db.query(`
      SELECT criado_em AS data, acertos, total, percentual
      FROM provas
      WHERE usuario_id = $1
      UNION ALL
      SELECT finalizada_em AS data, acertos, total, percentual
      FROM respostas_provas_professor
      WHERE aluno_id = $1 AND finalizada = TRUE AND finalizada_em IS NOT NULL
      ORDER BY data DESC
    `, [userId]);
    const provas = provasRes.rows;
    const total = provas.length;

    const u = await db.query(`SELECT xp, nivel, last_active FROM usuarios WHERE id=$1`, [userId]);
    const xp = Number(u.rows[0]?.xp || 0);
    const nivel = Number(u.rows[0]?.nivel || 1);
    const lastActive = u.rows[0]?.last_active ? new Date(u.rows[0].last_active) : null;

    const dates = Array.from(new Set(
      provas
        .filter(prova => prova.data)
        .map(prova => new Date(prova.data).toISOString().slice(0, 10))
    )).map(data => new Date(`${data}T00:00:00`)).sort((a, b) => b - a);

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
      tres_provas: total >= 3,
      dez_provas: total >= 10,
      cinquenta_provas: total >= 50,
      prova_perfeita: provas.some(prova => Number(prova.total) > 0 && Number(prova.percentual) >= 100),
      xp_100: xp >= 100,
      nivel_5: nivel >= 5,
      nivel_10: nivel >= 10,
      streak_3: streak >= 3,
      streak_7: streak >= 7,
      streak_days: streak,
      last_active: lastActive
    };

    // mapeamento de títulos/descrições para histórico
    const mapa = {
      primeira_prova: { titulo: 'Primeira prova', descricao: 'Concluiu a primeira prova' },
      tres_provas: { titulo: 'Em ritmo', descricao: 'Concluiu 3 provas' },
      dez_provas: { titulo: '10 provas', descricao: 'Concluiu 10 provas' },
      cinquenta_provas: { titulo: '50 provas', descricao: 'Concluiu 50 provas' },
      prova_perfeita: { titulo: 'Nota máxima', descricao: 'Acertou 100% de uma prova' },
      xp_100: { titulo: '100 XP', descricao: 'Acumulou seus primeiros 100 XP' },
      nivel_5: { titulo: 'Nível 5', descricao: 'Alcançou o nível 5' },
      nivel_10: { titulo: 'Nível 10', descricao: 'Alcançou o nível 10' },
      streak_3: { titulo: 'Constância', descricao: 'Concluiu provas por 3 dias seguidos' },
      streak_7: { titulo: 'Sequência 7 dias', descricao: 'Finalizou provas por 7 dias consecutivos' }
    };

    // buscar conquistas já gravadas
    const existingRes = await db.query(`SELECT chave FROM conquistas_historico WHERE usuario_id = $1`, [userId]);
    const existing = new Set(existingRes.rows.map(r => r.chave));

    // inserir novas conquistas no histórico
    const novasConquistas = [];
    for (const key of Object.keys(mapa)) {
      if (conquistas[key] && !existing.has(key)) {
        const meta = {};
        if (key === 'dez_provas') meta.count = 10;
        if (key === 'cinquenta_provas') meta.count = 50;
        if (key === 'streak_7') meta.days = streak;
        try {
          const insert = await db.query(`
            INSERT INTO conquistas_historico(usuario_id, chave, titulo, descricao, meta)
            VALUES($1,$2,$3,$4,$5)
            ON CONFLICT (usuario_id, chave) DO NOTHING
            RETURNING chave, titulo, descricao, meta, criado_em
          `, [userId, key, mapa[key].titulo, mapa[key].descricao, meta]);
          if (insert.rows[0]) novasConquistas.push(insert.rows[0]);
        } catch (e) {
          console.error('Erro gravar conquista', key, e);
        }
      }
    }

    // retornar também o histórico recente
    const hist = await db.query(`SELECT id, chave, titulo, descricao, meta, criado_em FROM conquistas_historico WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 100`, [userId]);

    res.json({ conquistas, total, xp, nivel, historico: hist.rows, novas_conquistas: novasConquistas });
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

    if (!await upload.validarAssinaturaImagem(req.file)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Arquivo de imagem inválido' });
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
    const { nome, email, senha, senha_atual } = req.body;

    const userResult = await db.query(`
      SELECT id, username, email, senha, foto FROM usuarios WHERE id = $1
    `, [req.user.id]);

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const novoNome = nome ? String(nome).trim() : user.username;
    const novoEmail = email ? String(email).toLowerCase().trim() : user.email;
    const emailAlterado = novoEmail !== user.email;
    const senhaAlterada = Boolean(senha);

    if (emailAlterado && senhaAlterada) {
      return res.status(400).json({ error: 'Altere email e senha em operações separadas' });
    }

    if (!novoNome || novoNome.length < 3) {
      return res.status(400).json({ error: 'Nome inválido' });
    }

    if (!validator.isEmail(novoEmail || '')) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    if ((emailAlterado || senhaAlterada) && !senha_atual) {
      return res.status(400).json({ error: 'Informe a senha atual para alterar email ou senha' });
    }

    if (emailAlterado || senhaAlterada) {
      const senhaAtualValida = await bcrypt.compare(String(senha_atual), user.senha);
      if (!senhaAtualValida) return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    if (senha) {
      if (typeof senha !== 'string' || senha.length < 8) {
        return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
      }
    }

    if (emailAlterado) {
      const existing = await db.query(
        'SELECT id FROM usuarios WHERE id <> $1 AND (LOWER(email) = LOWER($2) OR LOWER(email_pendente) = LOWER($2))',
        [req.user.id, novoEmail]
      );
      if (existing.rows.length) return res.status(409).json({ error: 'Email já em uso ou pendente' });
    }

    const passwordHash = senhaAlterada ? await bcrypt.hash(senha, 10) : null;
    const pendingCode = emailAlterado ? crypto.randomInt(100000, 1000000).toString() : null;
    if (emailAlterado) {
      const delivery = await enviarEmail(
        novoEmail,
        'Confirme seu novo email - FórmulaVest',
        `Seu código de confirmação é: ${pendingCode}`
      );
      if (!delivery?.ok) return res.status(503).json({ error: 'Não foi possível enviar o código para o novo email' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE usuarios
        SET username = $1,
            senha = COALESCE($2, senha),
            token_version = COALESCE(token_version, 0) + $3,
            email_pendente = CASE WHEN $4::text IS NULL THEN email_pendente ELSE $4 END,
            email_pendente_codigo = CASE WHEN $4::text IS NULL THEN email_pendente_codigo ELSE $5 END,
            email_pendente_expira = CASE WHEN $4::text IS NULL THEN email_pendente_expira ELSE NOW() + INTERVAL '10 minutes' END
        WHERE id = $6
      `, [
        novoNome,
        passwordHash,
        senhaAlterada ? 1 : 0,
        emailAlterado ? novoEmail : null,
        pendingCode ? crypto.createHash('sha256').update(pendingCode).digest('hex') : null,
        req.user.id
      ]);
      if (senhaAlterada) await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (senhaAlterada) {
      const cookieOptions = { path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
    }

    res.json({
      ok: true,
      nome: novoNome,
      email: user.email,
      email_confirmation_required: emailAlterado,
      session_revoked: senhaAlterada
    });

  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'Email já em uso' });
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

app.post('/atualizar-email/confirmar', authLimiter, auth, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.codigo || '').trim();
  if (!validator.isEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Email ou código inválido' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE usuarios u
      SET email = u.email_pendente,
          email_pendente = NULL,
          email_pendente_codigo = NULL,
          email_pendente_expira = NULL,
          token_version = COALESCE(u.token_version, 0) + 1
      WHERE LOWER(u.email_pendente) = LOWER($1)
        AND u.email_pendente_codigo = $2
        AND u.email_pendente_expira > NOW()
        AND u.id = $3
        AND COALESCE(u.banido, FALSE) = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM usuarios existing
          WHERE LOWER(existing.email) = LOWER(u.email_pendente) AND existing.id <> u.id
        )
      RETURNING u.id
    `, [email, crypto.createHash('sha256').update(code).digest('hex'), req.user.id]);

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Email ou código inválido/expirado' });
    }

    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [result.rows[0].id]);
    await client.query('COMMIT');
    const cookieOptions = { path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    return res.json({ ok: true, session_revoked: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'Email já em uso' });
    return res.status(500).json({ error: 'Erro ao confirmar email' });
  } finally {
    client.release();
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

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const update = await client.query(`
        UPDATE usuarios
        SET senha = $1, token_version = COALESCE(token_version, 0) + 1
        WHERE id = $2 AND senha = $3
        RETURNING id
      `, [hash, req.user.id, user.senha]);
      if (!update.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Senha alterada em outra sessão; autentique-se novamente' });
      }
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const cookieOptions = { path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro trocar senha" });
  }
});
};
