module.exports = function registerProvasRoutes(app, deps = {}) {
  const { PDFDocument, auth, cache, chamarIA, db, extrairJSONSeguro } = deps;

function gerarCodigoProva() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function removerGabarito(questoes) {
  return questoes.map(({ correta, ...questao }, index) => ({
    id: index,
    ...questao
  }));
}

function normalizarQuestaoProfessor(questao) {
  return {
    enunciado: String(questao.enunciado || "").trim(),
    opcoes: questao.opcoes || {},
    correta: String(questao.correta || "").trim().toUpperCase(),
    materia: questao.materia || null
  };
}

async function carregarProvaProfessorDoProfessor(provaId, user) {
  const result = await db.query(`
    SELECT
      pp.*,
      e.empresa_id
    FROM provas_professor pp
    LEFT JOIN escolas e ON e.id = pp.escola_id
    WHERE pp.id = $1
  `, [provaId]);

  const prova = result.rows[0];

  if (!prova) return null;
  if (user.role === "formulavest_master") return prova;
  if (prova.professor_id === user.id) return prova;
  if (user.role === "empresa_admin" && prova.empresa_id === user.empresa_id) return prova;
  if (
    ["diretor", "coordenador"].includes(user.role) &&
    prova.escola_id &&
    prova.escola_id === user.escola_id
  ) return prova;

  return false;
}

// ======================
// GERAR PROVÃO PAULISTA
// ======================
app.post('/gerar-provao', auth, async (req, res) => {
  try {
    const resposta =
      await chamarIA(`
Crie uma prova com 10 questões baseada no estilo do Provão Paulista.

RETORNE SOMENTE JSON:

{
  "questoes":[
    {
      "enunciado":"",
      "opcoes":{
        "A":"",
        "B":"",
        "C":"",
        "D":"",
        "E":""
      },
      "correta":"A"
    }
  ]
}
`);

    const json =
      extrairJSONSeguro(
        resposta
      );

    if (!json?.questoes) {
      return res.status(500).json({
        error:
          "IA inválida"
      });
    }

    const result =
      await db.query(`
        INSERT INTO provas_ativas(
          usuario_id,
          questoes
        )
        VALUES($1,$2)
        RETURNING id
      `, [
        req.user.id,
        JSON.stringify(
          json.questoes
        )
      ]);

    const provaId =
      result.rows[0].id;

    res.json({
      prova_id:
        provaId,
      questoes:
        json.questoes
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error:
        "Erro gerar Provão"
    });
  }
});



// ======================
// GERAR PROVA
// ======================
app.post("/gerar-prova", auth, async (req, res) => {
  try {
    const { curso, faculdade, quantidade } = req.body;

    const qtd = Number(quantidade) || 10;

    console.log("GERANDO PROVA...");
    console.log(req.body);

    const prompt = `
Crie ${qtd} questões estilo ENEM para:

Curso: ${curso}
Faculdade: ${faculdade}

RETORNE SOMENTE JSON VÁLIDO:

{
  "questoes": [
    {
      "enunciado": "Pergunta aqui",
      "opcoes": {
        "A": "Texto",
        "B": "Texto",
        "C": "Texto",
        "D": "Texto",
        "E": "Texto"
      },
      "correta": "A"
    }
  ]
}
`;

    const resposta = await chamarIA(prompt);

    const json =
      extrairJSONSeguro(resposta);

    console.log("JSON EXTRAÍDO:");
    console.log(json);

    if (
      !json ||
      !json.questoes ||
      !Array.isArray(json.questoes)
    ) {
      return res.status(500).json({
        error:
          "IA retornou formato inválido"
      });
    }

    return res.json({
      questoes: json.questoes
    });

  } catch (err) {
    console.error(
      "ERRO GERAR PROVA:",
      err
    );

    return res.status(500).json({
      error:
        "Erro ao gerar prova"
    });
  }
});

app.post("/gerar-simulado-materia", auth, async (req, res) => {
  try {
    const { materia, quantidade, dificuldade } = req.body;
    const qtd = Math.min(Number(quantidade) || 10, 30);

    if (!materia) {
      return res.status(400).json({ error: "Materia obrigatoria" });
    }

    const prompt = `
Crie ${qtd} questoes ineditas estilo ENEM sobre a materia: ${materia}.
Dificuldade: ${dificuldade || "media"}.

RETORNE SOMENTE JSON VALIDO:
{
  "questoes": [
    {
      "enunciado": "",
      "materia": "${materia}",
      "opcoes": {
        "A": "",
        "B": "",
        "C": "",
        "D": "",
        "E": ""
      },
      "correta": "A"
    }
  ]
}
`;

    const resposta = await chamarIA(prompt);
    const json = extrairJSONSeguro(resposta);

    if (!json?.questoes || !Array.isArray(json.questoes)) {
      return res.status(500).json({ error: "IA retornou formato invalido" });
    }

    const result = await db.query(`
      INSERT INTO provas_ativas(
        usuario_id,
        questoes
      )
      VALUES($1,$2)
      RETURNING id
    `, [
      req.user.id,
      JSON.stringify(json.questoes)
    ]);

    res.json({
      prova_id: result.rows[0].id,
      questoes: json.questoes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro gerar simulado por materia" });
  }
});

// ======================
// GERAR ENEM (90 questões)
// ======================
app.post('/gerar-enem', auth, async (req, res) => {
  try {
    let questoes = [];
    let tentativas = 0;

    while (questoes.length < 10 && tentativas < 5) {
      tentativas++;

      try {
        const resposta = await chamarIA(`
Crie 10 questões inéditas estilo ENEM.

RETORNE SOMENTE JSON:
{
  "questoes":[
    {
      "enunciado":"",
      "opcoes":{
        "A":"",
        "B":"",
        "C":"",
        "D":"",
        "E":""
      },
      "correta":"A"
    }
  ]
}
`);

        const json =
          extrairJSONSeguro(
            resposta
          );

        if (json?.questoes) {
          questoes.push(
            ...json.questoes
          );
        }

      } catch (e) {
        console.log(
          "Tentativa falhou"
        );
      }
    }

    if (questoes.length === 0) {
      return res.status(500).json({
        error:
          "Falha ao gerar questões"
      });
    }

    const result =
      await db.query(`
        INSERT INTO provas_ativas(
          usuario_id,
          questoes
        )
        VALUES($1,$2)
        RETURNING id
      `, [
        req.user.id,
        JSON.stringify(
          questoes
        )
      ]);

    const provaId =
      result.rows[0].id;

    res.json({
      prova_id: provaId,
      questoes
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error:
        "Erro ENEM"
    });
  }
});

// ======================
// SALVAR PROVA
// ======================
app.post("/salvar-prova", auth, async (req, res) => {
  try {
    const { prova_id, questoes } = req.body;

    const ativo = await db.query(`
      SELECT *
      FROM provas_ativas
      WHERE id=$1 AND usuario_id=$2
    `, [prova_id, req.user.id]);

    const prova = ativo.rows[0];

    if (!prova) {
      return res.status(404).json({ error: "Prova não encontrada" });
    }

    if (prova.finalizada) {
      return res.status(400).json({ error: "Prova já finalizada" });
    }

    const gabarito = prova.questoes;

    let acertos = 0;

    questoes.forEach((q, i) => {
      if (q.selecionada === gabarito[i].correta) {
        acertos++;
      }
    });

    const percentual = (acertos / questoes.length) * 100;
    const xpGanho = Math.floor(percentual);

    // XP + nível (1 query só)
    await db.query(`
      UPDATE usuarios
      SET 
        xp = xp + $1,
        nivel = FLOOR((xp + $1) / 100) + 1
      WHERE id = $2
    `, [xpGanho, req.user.id]);

    await db.query(`
      INSERT INTO provas(
        usuario_id,
        acertos,
        total,
        percentual,
        questoes
      )
      VALUES ($1,$2,$3,$4,$5)
    `, [
      req.user.id,
      acertos,
      questoes.length,
      percentual,
      JSON.stringify(questoes)
    ]);

    await db.query(`
      UPDATE provas_ativas
      SET finalizada = TRUE
      WHERE id = $1
    `, [prova_id]);

    cache.del(`provas_${req.user.id}`);

    res.json({
      ok: true,
      acertos,
      percentual
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro salvar prova" });
  }
});

// ======================
// HISTÓRICO
// ======================
app.get('/provas', auth, async (req, res) => {
  try {
    const cacheKey = `provas_${req.user.id}`;
    const cached = cache.get(cacheKey);

    if (cached) return res.json({ provas: cached });

    const result = await db.query(`
      SELECT * FROM provas
      WHERE usuario_id = $1
      ORDER BY id DESC
    `, [req.user.id]);

    cache.set(cacheKey, result.rows);
    res.json({ provas: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro histórico' });
  }
});

app.delete('/provas/:id', auth, async (req, res) => {
  try {
    const result = await db.query(`
      DELETE FROM provas
      WHERE id = $1
      AND usuario_id = $2
      RETURNING id
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Prova nao encontrada" });
    }

    cache.del(`provas_${req.user.id}`);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro excluir prova" });
  }
});


//=======================
//teste email

app.get("/dashboard", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.query(`
      SELECT xp, nivel
      FROM usuarios
      WHERE id = $1
    `, [userId]);

    const provas = await db.query(`
      SELECT acertos, total, percentual, criado_em
      FROM provas
      WHERE usuario_id = $1
      ORDER BY id ASC
    `, [userId]);

    res.json({
      user: user.rows[0],
      provas: provas.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro dashboard" });
  }
});



app.get("/grafico", auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT questoes
      FROM provas
      WHERE usuario_id = $1
    `, [req.user.id]);

    const materias = {
      matematica: 0,
      portugues: 0,
      ciencias: 0,
      humanas: 0
    };

    result.rows.forEach(p => {
      const q = p.questoes;

      q.forEach(item => {
        const materia = item.materia || "geral";

        if (!materias[materia]) {
          materias[materia] = 0;
        }

        if (item.correta === item.selecionada) {
          materias[materia]++;
        }
      });
    });

    res.json(materias);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro gráfico" });
  }
});
// ======================
// RANKING
// ======================
app.get("/ranking", auth, async (req, res) => {
  try {
    let query = `
      SELECT username, xp, nivel, foto
      FROM usuarios
    `;

    const params = [];
    const conditions = [];

    if (req.user.role !== "formulavest_master") {
      conditions.push(`empresa_id = $${params.length + 1}`);
      params.push(req.user.empresa_id);
    }

    if (req.user.escola_id) {
      conditions.push(`escola_id = $${params.length + 1}`);
      params.push(req.user.escola_id);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY xp DESC LIMIT 50";

    const result = await db.query(query, params);

    res.json(result.rows); // 🔥 IMPORTANTE: array puro

  } catch (err) {
    console.error("Ranking erro:", err);
    res.status(500).json({ error: "Erro ranking" });
  }
});
// ======================
// CORRIGIR REDAÇÃO
// ======================
app.post('/corrigir-redacao', auth, async (req, res) => {
  try {
    const { tema, texto } = req.body;

const prompt = `
Corrija esta redação ENEM seguindo as 5 competências:

Competência 1: norma padrão
Competência 2: compreensão do tema
Competência 3: argumentação
Competência 4: coesão
Competência 5: proposta de intervenção

Tema: ${tema}
Texto: ${texto}

RETORNE JSON:
{
 "competencia1":0-200,
 "competencia2":0-200,
 "competencia3":0-200,
 "competencia4":0-200,
 "competencia5":0-200,
 "nota_total":0-1000,
 "feedback":""
}
`;;

    const resposta = await chamarIA(prompt);
    const json = extrairJSONSeguro(resposta);

    if (!json) {
      return res.status(500).json({ error: 'Erro correção' });
    }

    const redacao = await db.query(`
      INSERT INTO redacoes(
        usuario_id,
        tema,
        texto,
        resultado,
        nota_total
      )
      VALUES($1,$2,$3,$4,$5)
      RETURNING id, criado_em
    `, [
      req.user.id,
      tema,
      texto,
      JSON.stringify(json),
      json.nota_total || null
    ]);

    res.json({
      ...json,
      redacao_id: redacao.rows[0].id,
      criado_em: redacao.rows[0].criado_em
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro redação' });
  }
});

app.get('/redacoes', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, tema, resultado, nota_total, criado_em
      FROM redacoes
      WHERE usuario_id = $1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json({ redacoes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro listar redacoes" });
  }
});

app.get(
  "/professor/provas",
  auth,
  async (req, res) => {
    try {
      if (!["formulavest_master", "empresa_admin", "diretor", "coordenador", "professor"].includes(req.user.role)) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      const params = [];
      const conditions = [];

      if (req.user.role === "professor") {
        conditions.push(`professor_id = $${params.length + 1}`);
        params.push(req.user.id);
      } else if (req.user.role === "empresa_admin") {
        conditions.push(`escola_id IN (SELECT id FROM escolas WHERE empresa_id = $${params.length + 1})`);
        params.push(req.user.empresa_id);
      } else if (req.user.role !== "formulavest_master" && req.user.escola_id) {
        conditions.push(`escola_id = $${params.length + 1}`);
        params.push(req.user.escola_id);
      }

      let query = `
        SELECT *
        FROM provas_professor
      `;

      if (conditions.length) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += " ORDER BY id DESC";

      const result = await db.query(query, params);

      res.json({ provas: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro listar provas do professor" });
    }
  }
);

app.post(
  "/professor/provas",
  auth,
  async (req, res) => {
    try {
      if (!["professor", "coordenador", "diretor", "empresa_admin", "formulavest_master"].includes(req.user.role)) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      const { titulo, tempo_minutos, sala_id, questoes } = req.body;
      const tempo = Number(tempo_minutos);

      if (!titulo || !tempo || tempo <= 0) {
        return res.status(400).json({ error: "Titulo e tempo sao obrigatorios" });
      }

      if (!Array.isArray(questoes) || questoes.length === 0) {
        return res.status(400).json({ error: "Informe ao menos uma questao" });
      }

      const salaId = sala_id || req.user.sala_id;
      if (!salaId) {
        return res.status(400).json({ error: "Sala obrigatoria" });
      }

      if (req.user.role === 'professor') {
        const assigned = await db.query('SELECT sala_id FROM professor_salas WHERE professor_id = $1', [req.user.id]);
        const allowedSalaIds = assigned.rows.map((row) => Number(row.sala_id));
        if (!allowedSalaIds.includes(Number(salaId)) && Number(req.user.sala_id) !== Number(salaId)) {
          return res.status(403).json({ error: 'Sala nao atribuida a voce' });
        }
      }

      const sala = await db.query(`
        SELECT
          s.*,
          p.escola_id,
          e.empresa_id
        FROM salas s
        JOIN periodos p ON p.id = s.periodo_id
        JOIN escolas e ON e.id = p.escola_id
        WHERE s.id = $1
      `, [salaId]);

      const s = sala.rows[0];

      if (!s) {
        return res.status(404).json({ error: "Sala nao encontrada" });
      }

      if (
        req.user.role !== "formulavest_master" &&
        s.empresa_id !== req.user.empresa_id
      ) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      const questoesNormalizadas = questoes.map(normalizarQuestaoProfessor);

      const invalida = questoesNormalizadas.some(q =>
        !q.enunciado ||
        !q.correta ||
        !q.opcoes ||
        !q.opcoes[q.correta]
      );

      if (invalida) {
        return res.status(400).json({ error: "Questao invalida" });
      }

      const result = await db.query(`
        INSERT INTO provas_professor(
          professor_id,
          escola_id,
          sala_id,
          titulo,
          tempo_minutos,
          questoes
        )
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING *
      `, [
        req.user.id,
        s.escola_id,
        s.id,
        titulo,
        tempo,
        JSON.stringify(questoesNormalizadas)
      ]);

      res.json({
        ok: true,
        prova: result.rows[0]
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro criar prova do professor" });
    }
  }
);

app.post(
  "/professor/provas/:id/iniciar",
  auth,
  async (req, res) => {
    try {
      if (!["professor", "coordenador", "diretor", "empresa_admin", "formulavest_master"].includes(req.user.role)) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      const prova = await carregarProvaProfessorDoProfessor(req.params.id, req.user);

      if (prova === null) {
        return res.status(404).json({ error: "Prova nao encontrada" });
      }

      if (prova === false) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      let codigo = gerarCodigoProva();
      let tentativas = 0;

      while (tentativas < 5) {
        const existe = await db.query(`
          SELECT id
          FROM provas_professor
          WHERE codigo = $1
        `, [codigo]);

        if (existe.rows.length === 0) break;

        codigo = gerarCodigoProva();
        tentativas++;
      }

      const result = await db.query(`
        UPDATE provas_professor
        SET
          status = 'ativa',
          codigo = $1,
          inicia_em = NOW(),
          encerra_em = NOW() + ($2::text || ' minutes')::INTERVAL
        WHERE id = $3
        RETURNING *
      `, [
        codigo,
        prova.tempo_minutos,
        prova.id
      ]);

      res.json({
        ok: true,
        prova: result.rows[0]
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro iniciar prova" });
    }
  }
);

app.post(
  "/professor/provas/:id/encerrar",
  auth,
  async (req, res) => {
    try {
      const prova = await carregarProvaProfessorDoProfessor(req.params.id, req.user);

      if (prova === null) {
        return res.status(404).json({ error: "Prova nao encontrada" });
      }

      if (prova === false) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      await db.query(`
        UPDATE provas_professor
        SET status = 'encerrada'
        WHERE id = $1
      `, [prova.id]);

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro encerrar prova" });
    }
  }
);

app.get(
  "/professor/provas/:id/resultados",
  auth,
  async (req, res) => {
    try {
      const prova = await carregarProvaProfessorDoProfessor(req.params.id, req.user);

      if (prova === null) {
        return res.status(404).json({ error: "Prova nao encontrada" });
      }

      if (prova === false) {
        return res.status(403).json({ error: "Sem permissao" });
      }

      const result = await db.query(`
        SELECT
          r.*,
          u.username,
          u.email,
          u.xp,
          u.nivel
        FROM respostas_provas_professor r
        JOIN usuarios u ON u.id = r.aluno_id
        WHERE r.prova_id = $1
        ORDER BY r.percentual DESC, r.finalizada_em ASC
      `, [prova.id]);

      res.json({
        prova,
        resultados: result.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro resultados prova" });
    }
  }
);

app.get('/professor/provas/:id/pdf', auth, async (req, res) => {
  try {
    const prova = await carregarProvaProfessorDoProfessor(req.params.id, req.user);

    if (prova === null) {
      return res.status(404).json({ error: 'Prova nao encontrada' });
    }

    if (prova === false) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const salaId = req.query.sala_id || prova.sala_id;

    const metaRes = await db.query(`
      SELECT
        s.nome AS sala_nome,
        p.nome AS periodo_nome,
        e.nome AS escola_nome
      FROM salas s
      JOIN periodos p ON p.id = s.periodo_id
      JOIN escolas e ON e.id = p.escola_id
      WHERE s.id = $1
    `, [salaId]);

    const meta = metaRes.rows[0] || {};

    const profRes = await db.query(`SELECT username FROM usuarios WHERE id = $1`, [prova.professor_id]);
    const professorNome = profRes.rows[0]?.username || 'Professor';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prova_${prova.id}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(24).fillColor('#0b3d91').text('FórmulaVest', { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(12).fillColor('#333').text('Prova impressa para sala', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(10).fillColor('#444');
    doc.text(`Escola: ${meta.escola_nome || '—'}`);
    doc.text(`Período: ${meta.periodo_nome || '—'}`);
    doc.text(`Sala: ${meta.sala_nome || '—'}`);
    doc.text(`Professor: ${professorNome}`);
    doc.text(`Título da prova: ${prova.titulo}`);
    doc.text(`Código: ${prova.codigo || '—'}`);
    doc.text(`Data de impressão: ${new Date().toLocaleDateString('pt-BR')}`);
    doc.moveDown(0.8);

    doc.fontSize(10).text('Nome do aluno: ____________________________________________');
    doc.text('Turma: __________________________      Nota: __________________________');
    doc.moveDown(1);

    prova.questoes.forEach((q, index) => {
      doc.fontSize(12).fillColor('#000').text(`Questão ${index + 1}`, { underline: true });
      doc.moveDown(0.2);
      doc.fontSize(10).text(q.enunciado, { align: 'justify' });
      doc.moveDown(0.2);

      Object.entries(q.opcoes || {}).forEach(([letra, texto]) => {
        doc.text(`${letra}) ${texto}`);
      });

      doc.moveDown(0.3);
      doc.text('Resposta: ________________________________________________');
      doc.moveDown(0.7);

      if (doc.y > 730) {
        doc.addPage();
      }
    });

    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text('Imprima esta prova em folha A4 para uso em sala de aula. Boa sorte!', { align: 'center' });
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro gerar PDF da prova' });
  }
});

app.post("/provas-prontas/entrar", auth, async (req, res) => {
  try {
    const codigo = String(req.body.codigo || "").trim().toUpperCase();

    if (!codigo) {
      return res.status(400).json({ error: "Codigo obrigatorio" });
    }

    const result = await db.query(`
      SELECT *
      FROM provas_professor
      WHERE codigo = $1
      AND status = 'ativa'
    `, [codigo]);

    const prova = result.rows[0];

    if (!prova) {
      return res.status(404).json({ error: "Prova nao encontrada ou encerrada" });
    }

    if (new Date(prova.encerra_em).getTime() <= Date.now()) {
      await db.query(`
        UPDATE provas_professor
        SET status = 'encerrada'
        WHERE id = $1
      `, [prova.id]);

      return res.status(400).json({ error: "Tempo da prova encerrado" });
    }

    if (
      req.user.role === "aluno" &&
      prova.sala_id &&
      req.user.sala_id &&
      prova.sala_id !== req.user.sala_id
    ) {
      return res.status(403).json({ error: "Prova nao pertence a sua sala" });
    }

    const jaRespondeu = await db.query(`
      SELECT id
      FROM respostas_provas_professor
      WHERE prova_id = $1
      AND aluno_id = $2
    `, [prova.id, req.user.id]);

    if (jaRespondeu.rows.length > 0) {
      return res.status(400).json({ error: "Voce ja finalizou esta prova" });
    }

    res.json({
      prova: {
        id: prova.id,
        titulo: prova.titulo,
        tempo_minutos: prova.tempo_minutos,
        encerra_em: prova.encerra_em,
        questoes: removerGabarito(prova.questoes)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro entrar na prova" });
  }
});

app.get("/professor/provas/:id/placar", auth, async (req, res) => {
  try {
    const prova = await carregarProvaProfessorDoProfessor(req.params.id, req.user);

    if (prova === null) {
      return res.status(404).json({ error: "Prova nao encontrada" });
    }

    if (prova === false) {
      return res.status(403).json({ error: "Sem permissao" });
    }

    const result = await db.query(`
      SELECT
        r.*,
        u.username,
        u.email,
        u.xp,
        u.nivel
      FROM respostas_provas_professor r
      JOIN usuarios u ON u.id = r.aluno_id
      WHERE r.prova_id = $1
      ORDER BY r.percentual DESC, r.finalizada_em ASC
    `, [prova.id]);

    res.json({
      prova,
      resultados: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro buscar placar" });
  }
});

// ======================
// PROFESSOR: PERIODOS / SALAS
// ======================
app.get('/professor/periodos', auth, async (req, res) => {
  try {
    if (!req.user.escola_id && req.user.role !== 'formulavest_master' && req.user.role !== 'empresa_admin') {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const params = [];
    let where = '';
    if (req.user.role === 'professor') {
      params.push(req.user.id);
      where = 'WHERE p.id IN (SELECT s.periodo_id FROM salas s WHERE s.id IN (SELECT sala_id FROM professor_salas WHERE professor_id = $1) OR s.id = COALESCE((SELECT sala_id FROM usuarios WHERE id=$1), NULL))';
    } else if (req.user.role === 'empresa_admin') {
      params.push(req.user.empresa_id);
      where = 'WHERE escola_id IN (SELECT id FROM escolas WHERE empresa_id=$1)';
    } else if (req.user.escola_id) {
      params.push(req.user.escola_id);
      where = 'WHERE escola_id=$1';
    }

    const result = await db.query(`SELECT * FROM periodos ${where} ORDER BY id DESC`, params);
    res.json({ periodos: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro listar períodos' });
  }
});

app.get('/professor/salas', auth, async (req, res) => {
  try {
    if (!req.user.escola_id && req.user.role !== 'formulavest_master' && req.user.role !== 'empresa_admin') {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    let result;
    if (req.user.role === 'professor') {
      result = await db.query(`
        SELECT DISTINCT s.*, p.nome as periodo_nome
        FROM salas s
        JOIN periodos p ON p.id = s.periodo_id
        WHERE s.id IN (SELECT sala_id FROM professor_salas WHERE professor_id = $1)
           OR s.id = COALESCE((SELECT sala_id FROM usuarios WHERE id = $1), NULL)
        ORDER BY p.id DESC, s.id DESC
      `, [req.user.id]);
    } else {
      const params = [];
      let where = '';
      if (req.user.role === 'empresa_admin') {
        params.push(req.user.empresa_id);
        where = 'WHERE p.escola_id IN (SELECT id FROM escolas WHERE empresa_id=$1)';
      } else if (req.user.escola_id) {
        params.push(req.user.escola_id);
        where = 'WHERE p.escola_id = $1';
      }

      result = await db.query(`
        SELECT s.*, p.nome as periodo_nome
        FROM salas s
        JOIN periodos p ON p.id = s.periodo_id
        ${where}
        ORDER BY p.id DESC, s.id DESC
      `, params);
    }

    res.json({ salas: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro listar salas' });
  }
});

app.post('/professor/salas', auth, async (req, res) => {
  try {
    const { periodo_id, nome } = req.body;
    if (!periodo_id || !nome) return res.status(400).json({ error: 'Periodo e nome obrigatorios' });

    const periodo = await db.query('SELECT p.*, e.empresa_id FROM periodos p JOIN escolas e ON e.id = p.escola_id WHERE p.id=$1', [periodo_id]);
    const p = periodo.rows[0];
    if (!p) return res.status(404).json({ error: 'Periodo nao encontrado' });
    if (req.user.role !== 'formulavest_master' && p.empresa_id !== req.user.empresa_id) return res.status(403).json({ error: 'Sem permissao' });

    const ins = await db.query('INSERT INTO salas(periodo_id,nome) VALUES($1,$2) RETURNING *', [periodo_id, nome]);
    res.json({ ok: true, sala: ins.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro criar sala' });
  }
});

app.post("/provas-prontas/:id/responder", auth, async (req, res) => {
  try {
    const { resposta, respostas, perguntaIndex } = req.body;
    const prova = await db.query(`
      SELECT *
      FROM provas_professor
      WHERE id = $1
      AND status = 'ativa'
    `, [req.params.id]);

    if (!prova.rows[0]) {
      return res.status(404).json({ error: "Prova nao encontrada ou encerrada" });
    }

    const provaAtiva = prova.rows[0];
    const respostasAtual = Array.isArray(respostas) ? respostas : [];
    const indice = Number.isInteger(Number(perguntaIndex)) ? Number(perguntaIndex) : respostasAtual.length - 1;

    if (typeof resposta === 'string' && indice >= 0) {
      respostasAtual[indice] = resposta.toUpperCase();
    }

    let acertos = 0;
    provaAtiva.questoes.forEach((questao, index) => {
      if (String(respostasAtual[index] || '').toUpperCase() === String(questao.correta || '').toUpperCase()) {
        acertos++;
      }
    });

    const total = provaAtiva.questoes.length;
    const percentual = total ? (acertos / total) * 100 : 0;

    await db.query(`
      INSERT INTO respostas_provas_professor(
        prova_id,
        aluno_id,
        respostas,
        acertos,
        total,
        percentual
      )
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT (prova_id, aluno_id) DO UPDATE SET
        respostas = EXCLUDED.respostas,
        acertos = EXCLUDED.acertos,
        total = EXCLUDED.total,
        percentual = EXCLUDED.percentual,
        finalizada_em = NOW()
    `, [
      provaAtiva.id,
      req.user.id,
      JSON.stringify(respostasAtual),
      acertos,
      total,
      percentual
    ]);

    res.json({ ok: true, acertos, total, percentual, respostas: respostasAtual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro salvar resposta" });
  }
});

app.post("/provas-prontas/:id/finalizar", auth, async (req, res) => {
  try {
    const { respostas } = req.body;

    if (!Array.isArray(respostas)) {
      return res.status(400).json({ error: "Respostas invalidas" });
    }

    const result = await db.query(`
      SELECT *
      FROM provas_professor
      WHERE id = $1
      AND status = 'ativa'
    `, [req.params.id]);

    const prova = result.rows[0];

    if (!prova) {
      return res.status(404).json({ error: "Prova nao encontrada ou encerrada" });
    }

    if (new Date(prova.encerra_em).getTime() <= Date.now()) {
      await db.query(`
        UPDATE provas_professor
        SET status = 'encerrada'
        WHERE id = $1
      `, [prova.id]);

      return res.status(400).json({ error: "Tempo da prova encerrado" });
    }

    const jaRespondeu = await db.query(`
      SELECT id
      FROM respostas_provas_professor
      WHERE prova_id = $1
      AND aluno_id = $2
    `, [prova.id, req.user.id]);

    if (jaRespondeu.rows.length > 0) {
      return res.status(400).json({ error: "Voce ja finalizou esta prova" });
    }

    const respostasPorId = new Map();

    respostas.forEach((resposta, index) => {
      if (typeof resposta === "string") {
        respostasPorId.set(index, resposta.toUpperCase());
      } else {
        respostasPorId.set(Number(resposta.id ?? index), String(resposta.selecionada || "").toUpperCase());
      }
    });

    let acertos = 0;

    prova.questoes.forEach((questao, index) => {
      if (respostasPorId.get(index) === questao.correta) {
        acertos++;
      }
    });

    const total = prova.questoes.length;
    const percentual = total ? (acertos / total) * 100 : 0;

    await db.query(`
      INSERT INTO respostas_provas_professor(
        prova_id,
        aluno_id,
        respostas,
        acertos,
        total,
        percentual
      )
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT (prova_id, aluno_id) DO UPDATE SET
        respostas = EXCLUDED.respostas,
        acertos = EXCLUDED.acertos,
        total = EXCLUDED.total,
        percentual = EXCLUDED.percentual,
        finalizada_em = NOW()
    `, [
      prova.id,
      req.user.id,
      JSON.stringify(respostas),
      acertos,
      total,
      percentual
    ]);

    // award XP to student: simple formula acertos * 10
    try {
      const xpEarned = Math.max(0, Number(acertos) * 10);
      await db.query(`
        UPDATE usuarios
        SET xp = xp + $1,
            nivel = FLOOR((xp + $1) / 100) + 1,
            last_active = NOW()
        WHERE id = $2
      `, [xpEarned, req.user.id]);
    } catch (e) {
      console.error('Erro awarding XP', e);
    }

    res.json({ ok: true, acertos, total, percentual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro finalizar prova" });
  }
});

// encerrar todas as transmissões do professor
app.post('/professor/provas/encerrar-todas', auth, async (req, res) => {
  try {
    if (!['professor','coordenador','diretor','empresa_admin','formulavest_master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const result = await db.query(`
      UPDATE provas_professor
      SET status = 'encerrada'
      WHERE status = 'ativa' AND professor_id = $1
      RETURNING id
    `, [req.user.id]);

    res.json({ ok: true, encerradas: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro encerrar todas' });
  }
});

// exportar estatísticas por período (CSV)
app.get('/professor/export/periodo/:periodoId', auth, async (req, res) => {
  try {
    const periodoId = req.params.periodoId;

    // only professors/admins
    if (!['professor','coordenador','diretor','empresa_admin','formulavest_master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const params = [periodoId];
    let professorFilter = '';
    if (req.user.role === 'professor') {
      params.push(req.user.id);
      professorFilter = 'AND p.professor_id = $2';
    }

    const rows = await db.query(`
      SELECT u.id, u.username, u.email, COUNT(r.id) AS provas_feitas, COALESCE(SUM(r.acertos),0) AS total_acertos, COALESCE(SUM(r.total),0) AS total_questoes, COALESCE(AVG(r.percentual),0) AS media_percentual, u.xp, u.nivel
      FROM respostas_provas_professor r
      JOIN provas_professor p ON p.id = r.prova_id
      JOIN salas s ON s.id = p.sala_id
      JOIN periodos per ON per.id = s.periodo_id
      JOIN usuarios u ON u.id = r.aluno_id
      WHERE per.id = $1
      ${professorFilter}
      GROUP BY u.id, u.username, u.email, u.xp, u.nivel
      ORDER BY provas_feitas DESC
    `, params);

    const header = ['id','username','email','provas_feitas','total_acertos','total_questoes','media_percentual','xp','nivel'];
    const csv = [header.join(',')].concat(rows.rows.map(r => [r.id, JSON.stringify(r.username||''), JSON.stringify(r.email||''), r.provas_feitas, r.total_acertos, r.total_questoes, (Number(r.media_percentual)||0).toFixed(1), r.xp||0, r.nivel||0].join(','))).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="periodo_${periodoId}_export.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro exportar periodo' });
  }
});

// exportar por sala (CSV)
app.get('/professor/export/sala/:salaId', auth, async (req, res) => {
  try {
    const salaId = req.params.salaId;
    if (!['professor','coordenador','diretor','empresa_admin','formulavest_master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const params = [salaId];
    let professorFilter = '';
    if (req.user.role === 'professor') {
      params.push(req.user.id);
      professorFilter = 'AND p.professor_id = $2';
    }

    const rows = await db.query(`
      SELECT u.id, u.username, u.email, COUNT(r.id) AS provas_feitas, COALESCE(SUM(r.acertos),0) AS total_acertos, COALESCE(SUM(r.total),0) AS total_questoes, COALESCE(AVG(r.percentual),0) AS media_percentual, u.xp, u.nivel
      FROM respostas_provas_professor r
      JOIN provas_professor p ON p.id = r.prova_id
      JOIN usuarios u ON u.id = r.aluno_id
      WHERE p.sala_id = $1
      ${professorFilter}
      GROUP BY u.id, u.username, u.email, u.xp, u.nivel
      ORDER BY provas_feitas DESC
    `, params);

    const header = ['id','username','email','provas_feitas','total_acertos','total_questoes','media_percentual','xp','nivel'];
    const csv = [header.join(',')].concat(rows.rows.map(r => [r.id, JSON.stringify(r.username||''), JSON.stringify(r.email||''), r.provas_feitas, r.total_acertos, r.total_questoes, (Number(r.media_percentual)||0).toFixed(1), r.xp||0, r.nivel||0].join(','))).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sala_${salaId}_export.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro exportar sala' });
  }
});

// ======================
// PDF PROTEGIDO
// ======================
app.get("/pdf-enem/:id", auth, async (req, res) => {
  const provaId = req.params.id;

  const result = await db.query(`
    SELECT * FROM provas
    WHERE id = $1 AND usuario_id = $2
  `, [provaId, req.user.id]);

  const prova = result.rows[0];

  if (!prova) {
    return res.status(404).send("Prova não encontrada");
  }

  const doc = new PDFDocument({ margin: 30 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=enem-${prova.id}.pdf`
  );

  doc.pipe(res);

  doc.fontSize(20).text("FórmulaVest - Simulado ENEM", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Acertos: ${prova.acertos}/${prova.total}`);
  doc.text(`Percentual: ${prova.percentual.toFixed(1)}%`);
  doc.moveDown();

  prova.questoes.forEach((q, i) => {
    doc.fontSize(14).text(`Questão ${i + 1}`);
    doc.fontSize(12).text(q.enunciado);
    doc.moveDown(0.5);

    Object.entries(q.opcoes).forEach(([k, v]) => {
      doc.text(`${k}) ${v}`);
    });

    doc.moveDown(0.5);
    doc.text(`Sua resposta: ${q.selecionada || "Não respondida"}`);
    doc.text(`Correta: ${q.correta}`);

    doc.moveDown();

    doc.text("━━━━━━━━━━━━━━━━━━━━━━");
    doc.moveDown();
  });

  doc.end();
});
};
