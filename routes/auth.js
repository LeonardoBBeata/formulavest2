module.exports = function registerAuthRoutes(app, deps = {}) {
  const { bcrypt, crypto, db, enviarEmail, gerarToken, loginLimiter, validator } = deps;

  // Helper: create a refresh token record
  async function createRefreshToken(userId) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days
    await db.query(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)`, [userId, token, expiresAt]);
    return { token, expiresAt };
  }

  async function rotateRefreshToken(oldToken) {
    // find existing
    const r = await db.query(`SELECT * FROM refresh_tokens WHERE token=$1`, [oldToken]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    // delete old and create new
    await db.query(`DELETE FROM refresh_tokens WHERE id=$1`, [row.id]);
    return createRefreshToken(row.user_id);
  }

  async function revokeRefreshToken(token) {
    if (!token) return;
    await db.query(`DELETE FROM refresh_tokens WHERE token=$1`, [token]);
  }

app.post('/register', async (req, res) => {
    try {
        const username = req.body.username?.trim();
        const email = req.body.email?.toLowerCase().trim();
        const senha = req.body.senha;
   

        // validações
        if (!username || username.length < 3) {
            return res.status(400).json({
                error: 'Usuário inválido (mínimo 3 caracteres)'
            });
        }

        if (!validator.isEmail(email || '')) {
            return res.status(400).json({
                error: 'Email inválido'
            });
        }

        if (!senha || senha.length < 8) {
            return res.status(400).json({
                error: 'Senha deve ter mínimo 8 caracteres'
            });
        }

        // verificar se já existe
        const existe = await db.query(
            `
            SELECT id
            FROM usuarios
            WHERE username = $1
               OR email = $2
            `,
            [username, email]
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({
                error: 'Usuário ou email já existe'
            });
        }

        // gerar hash da senha
        const hash = await bcrypt.hash(senha, 10);

        // gerar código de verificação
        const codigo = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // salvar usuário no banco
        await db.query(
            `
INSERT INTO usuarios (
  username,
  email,
  senha,
  codigo_verificacao,
  verificado
)
VALUES ($1,$2,$3,$4,FALSE)
            `,
            [
                username,
                email,
                hash,
                codigo
            ]
        );

        console.log('Tentando enviar email para:', email);

        const emailResult = await enviarEmail(
            email,
            'Código de verificação - FórmulaVest',
            `Seu código de verificação é: ${codigo}`
        );

        if (!emailResult?.ok) {
            console.warn('Falha ao enviar email de verificação; cadastro segue com sucesso.', emailResult?.reason);
        }

        return res.json({
            ok: true,
            message: emailResult?.ok
                ? 'Codigo enviado para seu email'
                : 'Cadastro realizado, mas não foi possível enviar o e-mail de verificação no momento.',
            email_enviado: Boolean(emailResult?.ok),
            dev_codigo:
                process.env.NODE_ENV === 'production'
                    ? undefined
                    : codigo
        });

    } catch (err) {
        console.error('ERRO NO REGISTER:', err);

        return res.status(500).json({
            error: 'Erro interno no registro'
        });
    }
});

// ======================
// MIDDLEWARE ADM
// ======================


// ======================
// VERIFY EMAIL
// ======================

app.post('/verificar-email', async (req, res) => {

    try {

        const email =
            req.body.email?.toLowerCase().trim();

        const {
            codigo
        } = req.body;

        const result =
            await db.query(
                `
                SELECT *
                FROM usuarios
                WHERE email=$1
                `,
                [email]
            );

        const user =
            result.rows[0];

        if (!user) {
            return res.status(404).json({
                error:
                    'Usuário não encontrado'
            });
        }

        if (
            user.codigo_verificacao
            !== codigo
        ) {
            return res.status(400).json({
                error:
                    'Código inválido'
            });
        }

        await db.query(
            `
            UPDATE usuarios
            SET
                verificado=TRUE,
                codigo_verificacao=NULL
            WHERE id=$1
            `,
            [user.id]
        );

        res.json({
            ok: true
        });

    } catch (err) {
        console.log(err);

        res.status(500).json({
            error:
                'Erro verificação'
        });
    }
});


app.post(
  "/login-iniciar",
  loginLimiter,
  async (req, res) => {
    try {
      const { email, senha } = req.body;

      const emailNormalizado =
        email?.toLowerCase()?.trim();

      if (!emailNormalizado) {
        return res.status(400).json({
          error: "Email obrigatório"
        });
      }

      if (!senha) {
        return res.status(400).json({
          error: "Senha obrigatória"
        });
      }

      const result = await db.query(`
        SELECT *
        FROM usuarios
        WHERE email = $1
      `, [emailNormalizado]);

      const user = result.rows[0];
      const senhaOk = user ? await bcrypt.compare(senha, user.senha) : false;

      if (!user || !senhaOk) {
        return res.status(401).json({
          error: "Credenciais inválidas"
        });
      }

      if (!user.verificado) {
        return res.status(403).json({
          error: "Verifique seu email primeiro"
        });
      }

      if (user.banido) {
        return res.status(403).json({
          error: "Usuário banido"
        });
      }

      // allow direct login (no code) for admin and professor convenience
      if (["adm@formulavest.com", "prof@formulavest.com"].includes(user.email.toLowerCase())) {
        return res.json({ ok: true, adminDirect: true });
      }

      const codigo = Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

      await db.query(`
        UPDATE usuarios
        SET codigo_verificacao=$1
        WHERE id=$2
      `, [
        codigo,
        user.id
      ]);

      await enviarEmail(
        user.email,
        "Código de login - FórmulaVest",
        `Seu código é: ${codigo}`
      );

      res.json({
        ok: true,
        dev_codigo:
          process.env.NODE_ENV === "production"
            ? undefined
            : codigo
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "Erro login"
      });
    }
  }
);
app.post(
  "/login-confirmar",
  loginLimiter,
  async (req, res) => {
    try {
      const {
        email,
        senha,
        codigo
      } = req.body;

      const emailNormalizado =
        email?.toLowerCase()?.trim();

      if (!emailNormalizado) {
        return res.status(400).json({
          error: "Email obrigatório"
        });
      }

      const result = await db.query(`
        SELECT *
        FROM usuarios
        WHERE email = $1
      `, [emailNormalizado]);

      const user = result.rows[0];
      const senhaOk = user ? await bcrypt.compare(senha, user.senha) : false;

      if (!user || !senhaOk) {
        return res.status(401).json({
          error: "Credenciais inválidas"
        });
      }

      if (user.banido) {
        return res.status(403).json({
          error: "Usuário banido"
        });
      }

      // skip code verification for master admin and professor accounts
      if (!["adm@formulavest.com", "prof@formulavest.com"].includes(user.email.toLowerCase())) {
        if (user.codigo_verificacao !== codigo) {
          return res.status(400).json({ error: "Código inválido" });
        }

        await db.query(`UPDATE usuarios SET codigo_verificacao=NULL WHERE id=$1`, [user.id]);
      }

      const token =
        gerarToken(user);

      // create refresh token and set httpOnly cookie
      try {
        const { token: refreshToken } = await createRefreshToken(user.id);
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000
        };
        res.cookie('refreshToken', refreshToken, cookieOptions);
      } catch (err) {
        console.error('Erro ao criar refresh token', err);
      }

      res.json({
        ok: true,
        token,
        role: user.role,
        empresa_id: user.empresa_id,
        escola_id: user.escola_id,
        sala_id: user.sala_id
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "Erro login"
      });
    }
  }
);

app.post(
  "/forgot-password",
  async (req, res) => {
    try {
      const email = String(req.body.email || '').toLowerCase().trim();

      const result =
        await db.query(`
          SELECT id
          FROM usuarios
          WHERE email=$1
        `, [email]);

      if (
        result.rows.length === 0
      ) {
        return res.json({
          message:
            "Se o email existir, enviaremos um link."
        });
      }

      const token =
        crypto.randomUUID();

      await db.query(`
        UPDATE usuarios
        SET
          reset_token=$1,
          reset_expira=
            NOW() + INTERVAL '1 hour'
        WHERE email=$2
      `, [token, email]);

      const resetHost = process.env.APP_URL || 'https://formulavest.onrender.com';
      const link = `${resetHost.replace(/\/$/, '')}/reset-password.html?token=${token}`;

      await enviarEmail(
        email,
        "Recuperar senha - FórmulaVest",
        `Acesse: ${link}`,
        `
        <h2>Recuperar senha</h2>
        <p>Clique abaixo:</p>
        <a href="${link}">
          Alterar senha
        </a>
        `
      );

      res.json({
        message:
          "Se o email existir, enviaremos um link."
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "Erro"
      });
    }
  }
);

app.post(
  "/reset-password",
  async (req, res) => {
    try {
      const {
        token,
        senha
      } = req.body;

      if (
        !senha ||
        senha.length < 8
      ) {
        return res
          .status(400)
          .json({
            error:
              "Senha muito curta"
          });
      }

      const result =
        await db.query(`
          SELECT *
          FROM usuarios
          WHERE reset_token=$1
          AND reset_expira > NOW()
        `, [token]);

      const user =
        result.rows[0];

      if (!user) {
        return res
          .status(400)
          .json({
            error:
              "Token inválido ou expirado"
          });
      }

      const hash =
        await bcrypt.hash(
          senha,
          10
        );

      await db.query(`
        UPDATE usuarios
        SET
          senha=$1,
          reset_token=NULL,
          reset_expira=NULL
        WHERE id=$2
      `, [
        hash,
        user.id
      ]);

      res.json({
        ok: true,
        message:
          "Senha alterada"
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "Erro ao resetar senha"
      });
    }
  }
);

// ======================
// TOKEN REFRESH
// ======================
app.post('/token/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'Refresh token ausente' });

    const result = await db.query(`SELECT * FROM refresh_tokens WHERE token=$1`, [token]);
    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: 'Refresh token inválido' });

    if (new Date(row.expires_at) < new Date()) {
      await db.query(`DELETE FROM refresh_tokens WHERE id=$1`, [row.id]);
      return res.status(401).json({ error: 'Refresh token expirado' });
    }

    // load user
    const userRes = await db.query(`SELECT * FROM usuarios WHERE id=$1`, [row.user_id]);
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário inválido' });

    // rotate refresh token
    const { token: newRefresh } = await rotateRefreshToken(token);
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    };
    res.cookie('refreshToken', newRefresh, cookieOptions);

    const access = gerarToken(user);
    res.json({ ok: true, token: access, role: user.role, empresa_id: user.empresa_id, escola_id: user.escola_id, sala_id: user.sala_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro refresh token' });
  }
});

app.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) await revokeRefreshToken(token);
    res.clearCookie('refreshToken', { path: '/' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deslogar' });
  }
});
};
