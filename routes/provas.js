const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');

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
    materia: String(questao.materia || questao.disciplina || "").trim() || null,
    assunto: String(questao.assunto || "").trim() || null,
    dificuldade: String(questao.dificuldade || "").trim() || null,
    explicacao: String(questao.explicacao || "").trim() || null,
    opcoes: questao.opcoes || {},
    correta: String(questao.correta || "").trim().toUpperCase()
  };
}

async function extrairTextoDoArquivo(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const data = await fs.promises.readFile(filePath);
    const parsed = await pdfParse(data);
    return String(parsed.text || '').trim();
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return String(result.value || '').trim();
  }

  throw new Error('Formato de arquivo nao suportado');
}

function criarUploadArquivo() {
  const uploadDir = path.join(__dirname, '..', 'uploads', 'imports');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safeName = path.basename(file.originalname || '');
      const ext = path.extname(safeName).toLowerCase();
      const finalExt = ['.pdf', '.docx'].includes(ext) ? ext : '.pdf';
      cb(null, `${req.user.id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${finalExt}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const safeName = path.basename(file.originalname || '');
      const ext = path.extname(safeName).toLowerCase();

      if (!allowedMimes.includes(file.mimetype) || !['.pdf', '.docx'].includes(ext)) {
        return cb(new Error('Apenas arquivos PDF e DOCX são permitidos'), false);
      }
      cb(null, true);
    }
  });
}

async function gerarPlanilhaEstatisticas({ titulo, linhas }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FórmulaVest';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Estatísticas', {
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  const headers = ['ID', 'Nome', 'Email', 'Provas feitas', 'Total acertos', 'Total questões', 'Média (%)', 'XP', 'Nível'];

  sheet.mergeCells('A1:I1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = titulo;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D91' } };
  });

  sheet.mergeCells('A2:I2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `Gerado em: ${new Date().toLocaleString('pt-BR')}   •   Total de alunos: ${linhas.length}`;
  subtitleCell.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
  sheet.getRow(2).height = 18;

  sheet.getRow(3).height = 6;

  const headerRowIndex = 4;
  const headerRow = sheet.getRow(headerRowIndex);
  headers.forEach((text, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = text;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5FCF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 20;

  linhas.forEach((row, index) => {
    const excelRow = sheet.addRow([
      row.id,
      row.username || '',
      row.email || '',
      Number(row.provas_feitas || 0),
      Number(row.total_acertos || 0),
      Number(row.total_questoes || 0),
      Number(row.media_percentual || 0) / 100,
      Number(row.xp || 0),
      Number(row.nivel || 0)
    ]);

    excelRow.getCell(7).numFmt = '0.0%';
    excelRow.eachCell((cell) => {
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
    });

    if (index % 2 === 1) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FD' } };
      });
    }
  });

  sheet.columns = [
    { width: 6 },
    { width: 26 },
    { width: 28 },
    { width: 13 },
    { width: 13 },
    { width: 14 },
    { width: 12 },
    { width: 8 },
    { width: 8 }
  ];

  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: headers.length }
  };

  return workbook.xlsx.writeBuffer();
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
    const curso = String(req.body.curso || '').trim().slice(0, 200);
    const faculdade = String(req.body.faculdade || '').trim().slice(0, 200);
    const quantidade = Math.min(Math.max(Number(req.body.quantidade) || 10, 1), 50);

    if (!curso || !faculdade) {
      return res.status(400).json({ error: 'Curso e faculdade são obrigatórios' });
    }

    const qtd = quantidade;

    console.log("GERANDO PROVA...");
    console.log({ curso, faculdade, quantidade: qtd });

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

app.post('/professor/provas/gerar-questao-ia', auth, async (req, res) => {
  try {
    if (!['professor','coordenador','diretor','empresa_admin','formulavest_master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt obrigatorio' });
    }

    if (prompt.length > 800) {
      return res.status(400).json({ error: 'Prompt muito longo. Reduza para no máximo 800 caracteres.' });
    }

    const iaPrompt = `
Crie UMA unica questão de múltipla escolha estilo ENEM com base neste prompt:
"${prompt}"

- Detecte automaticamente a matéria e o assunto, se possível.
- Classifique a dificuldade como "facil", "medio" ou "dificil".
- Inclua uma breve explicação da resposta correta no campo "explicacao".
- Retorne apenas JSON válido.

RETORNE SOMENTE JSON VALIDO:
{
  "questao": {
    "enunciado": "",
    "materia": "",
    "assunto": "",
    "dificuldade": "facil|medio|dificil",
    "explicacao": "",
    "opcoes": {
      "A": "",
      "B": "",
      "C": "",
      "D": ""
    },
    "correta": "A"
  }
}
`;

    const resposta = await chamarIA(iaPrompt);
    const json = extrairJSONSeguro(resposta);

    if (!json?.questao || !json.questao.enunciado || !json.questao.opcoes || !json.questao.correta) {
      return res.status(500).json({ error: 'IA retornou formato inválido' });
    }

    const opcoes = json.questao.opcoes || {};
    const correta = String(json.questao.correta || '').toUpperCase();
    const validOptions = ['A', 'B', 'C', 'D'];

    if (!validOptions.includes(correta) || !validOptions.every((letra) => typeof opcoes[letra] === 'string')) {
      return res.status(500).json({ error: 'IA retornou opções inválidas' });
    }

    const questao = {
      enunciado: String(json.questao.enunciado || '').trim(),
      materia: String(json.questao.materia || '').trim(),
      assunto: String(json.questao.assunto || '').trim(),
      dificuldade: String(json.questao.dificuldade || '').trim(),
      explicacao: String(json.questao.explicacao || '').trim(),
      opcoes: {
        A: String(opcoes.A || '').trim(),
        B: String(opcoes.B || '').trim(),
        C: String(opcoes.C || '').trim(),
        D: String(opcoes.D || '').trim()
      },
      correta
    };

    return res.json({ questao });
  } catch (err) {
    console.error('ERRO GERAR QUESTAO IA:', err);
    return res.status(500).json({ error: 'Erro ao gerar questão via IA' });
  }
});

app.post('/professor/provas/importar', auth, criarUploadArquivo().single('arquivo'), async (req, res) => {
  let uploadedPath;
  try {
    if (!['professor','coordenador','diretor','empresa_admin','formulavest_master'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo obrigatorio' });
    }

    uploadedPath = req.file.path;
    const quantidade = Math.min(Math.max(Number(req.body.quantidade) || 10, 1), 50);
    const texto = await extrairTextoDoArquivo(uploadedPath);

    if (!texto) {
      return res.status(500).json({ error: 'Nao foi possivel extrair texto do arquivo' });
    }

    const iaPrompt = `
Extraia até ${quantidade} questões de múltipla escolha estilo ENEM do texto abaixo. Use apenas informações presentes no documento.

- Para cada questão, deduza automaticamente a matéria e o assunto.
- Classifique a dificuldade como "facil", "medio" ou "dificil".
- Adicione uma breve explicação da resposta correta.
- Retorne apenas JSON válido.

RETORNE SOMENTE JSON VALIDO:
{
  "questoes": [
    {
      "enunciado": "",
      "materia": "",
      "assunto": "",
      "dificuldade": "facil|medio|dificil",
      "explicacao": "",
      "opcoes": {
        "A": "",
        "B": "",
        "C": "",
        "D": ""
      },
      "correta": "A"
    }
  ]
}

Texto do documento:
"""
${texto.slice(0, 40000)}
"""
`;

    const resposta = await chamarIA(iaPrompt);
    const json = extrairJSONSeguro(resposta);

    if (!json?.questoes || !Array.isArray(json.questoes) || json.questoes.length === 0) {
      return res.status(500).json({ error: 'IA retornou formato inválido' });
    }

    const validOptions = ['A', 'B', 'C', 'D'];
    const questoes = json.questoes.map((q) => {
      const opcoes = q.opcoes || {};
      const correta = String(q.correta || '').toUpperCase();
      return {
        enunciado: String(q.enunciado || '').trim(),
        materia: String(q.materia || '').trim(),
        assunto: String(q.assunto || '').trim(),
        dificuldade: String(q.dificuldade || '').trim(),
        explicacao: String(q.explicacao || '').trim(),
        opcoes: {
          A: String(opcoes.A || '').trim(),
          B: String(opcoes.B || '').trim(),
          C: String(opcoes.C || '').trim(),
          D: String(opcoes.D || '').trim()
        },
        correta
      };
    });

    const invalida = questoes.some((q) =>
      !q.enunciado || !q.correta || !validOptions.includes(q.correta) ||
      !q.opcoes[q.correta]
    );

    if (invalida) {
      return res.status(500).json({ error: 'IA retornou questões inválidas' });
    }

    return res.json({ questoes });
  } catch (err) {
    console.error('ERRO IMPORTAR PROVA:', err);
    return res.status(500).json({ error: err.message || 'Erro ao importar prova' });
  } finally {
    if (uploadedPath) {
      fs.promises.unlink(uploadedPath).catch(() => {});
    }
  }
});

app.post("/gerar-simulado-materia", auth, async (req, res) => {
  try {
    const materia = String(req.body.materia || '').trim().slice(0, 150);
    const quantidade = Math.min(Math.max(Number(req.body.quantidade) || 10, 1), 30);
    const dificuldade = String(req.body.dificuldade || '').trim().slice(0, 20) || 'media';

    if (!materia) {
      return res.status(400).json({ error: "Materia obrigatoria" });
    }

    const qtd = quantidade;

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

    if (!Array.isArray(questoes) || questoes.length === 0) {
      return res.status(400).json({ error: 'Questões inválidas' });
    }

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

    const gabarito = Array.isArray(prova.questoes) ? prova.questoes : [];

    let acertos = 0;

    questoes.forEach((q, i) => {
      const selecionada = String(q?.selecionada || '').toUpperCase();
      const correta = String(gabarito[i]?.correta || '').toUpperCase();
      if (selecionada && selecionada === correta) {
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

    if (!Array.isArray(prova.questoes) || prova.questoes.length === 0) {
      return res.status(400).json({ error: 'Esta prova nao possui questoes para exportar' });
    }

    const salaId = prova.sala_id;

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
    res.setHeader('Content-Disposition', `attachment; filename="prova_${prova.id}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Cabeçalho
    doc.rect(doc.page.margins.left, doc.page.margins.top, pageWidth, 70).fill('#0b3d91');
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('FórmulaVest', doc.page.margins.left + 15, doc.page.margins.top + 12);
    doc.fontSize(10).font('Helvetica')
      .text('Prova impressa para aplicação em sala de aula', doc.page.margins.left + 15, doc.page.margins.top + 40);

    doc.y = doc.page.margins.top + 85;
    doc.x = doc.page.margins.left;

    // Bloco de metadados em caixa
    const metaTop = doc.y;
    doc.roundedRect(doc.page.margins.left, metaTop, pageWidth, 100, 6).stroke('#c9d6f2');
    doc.fillColor('#0b3d91').fontSize(11).font('Helvetica-Bold')
      .text(String(prova.titulo || 'Prova'), doc.page.margins.left + 12, metaTop + 10, { width: pageWidth - 24 });

    doc.fillColor('#333').fontSize(9).font('Helvetica');
    const colWidth = (pageWidth - 24) / 2;
    const leftX = doc.page.margins.left + 12;
    const rightX = leftX + colWidth;
    let rowY = metaTop + 30;

    doc.text(`Escola: ${meta.escola_nome || '—'}`, leftX, rowY, { width: colWidth - 10 });
    doc.text(`Período: ${meta.periodo_nome || '—'}`, rightX, rowY, { width: colWidth - 10 });
    rowY += 16;
    doc.text(`Sala: ${meta.sala_nome || '—'}`, leftX, rowY, { width: colWidth - 10 });
    doc.text(`Professor(a): ${professorNome}`, rightX, rowY, { width: colWidth - 10 });
    rowY += 16;
    doc.text(`Código da prova: ${prova.codigo || '—'}`, leftX, rowY, { width: colWidth - 10 });
    doc.text(`Data de impressão: ${new Date().toLocaleDateString('pt-BR')}`, rightX, rowY, { width: colWidth - 10 });
    rowY += 16;
    doc.text(`Duração: ${prova.tempo_minutos ? prova.tempo_minutos + ' minutos' : '—'}`, leftX, rowY, { width: colWidth - 10 });
    doc.text(`Total de questões: ${prova.questoes.length}`, rightX, rowY, { width: colWidth - 10 });

    doc.y = metaTop + 110;
    doc.x = doc.page.margins.left;

    // Campos de identificação do aluno
    doc.fontSize(9).fillColor('#000');
    doc.text('Nome do aluno: ________________________________________________________________');
    doc.moveDown(0.4);
    doc.text('Turma: _____________________________      Nota: _____________________________');
    doc.moveDown(1);

    prova.questoes.forEach((q, index) => {
      const blocoAltura = 90 + (Object.keys(q.opcoes || {}).length * 14);
      if (doc.y + blocoAltura > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }

      const numeroTop = doc.y;
      doc.circle(doc.page.margins.left + 8, numeroTop + 8, 10).fill('#0b3d91');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
        .text(String(index + 1), doc.page.margins.left + 2, numeroTop + 4, { width: 14, align: 'center' });

      doc.fillColor('#000').fontSize(10.5).font('Helvetica-Bold')
        .text('Questão', doc.page.margins.left + 24, numeroTop, { continued: false });

      doc.moveDown(0.3);
      doc.x = doc.page.margins.left;
      doc.fontSize(10).font('Helvetica').fillColor('#111')
        .text(q.enunciado || '', { align: 'justify' });
      doc.moveDown(0.35);

      Object.entries(q.opcoes || {}).forEach(([letra, texto]) => {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0b3d91')
          .text(`${letra})`, doc.page.margins.left + 8, doc.y, { continued: true, width: 20 });
        doc.font('Helvetica').fillColor('#222').text(` ${texto}`, { width: pageWidth - 30 });
      });

      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666')
        .text('Resposta: ______________________________________________________________________');
      doc.moveDown(0.9);

      // linha separadora fina
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor('#e5e5e5').stroke();
      doc.moveDown(0.7);
    });

    // Rodapé com numeração de página
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#999')
        .text(
          `FórmulaVest • ${prova.titulo || ''} • Página ${i + 1} de ${pageRange.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 15,
          { width: pageWidth, align: 'center' }
        );
    }

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

app.get('/professor/provas/:id/xls', auth, async (req, res) => {
  try {
    const prova = await carregarProvaProfessorDoProfessor(req.params.id, req.user);

    if (prova === null) {
      return res.status(404).json({ error: 'Prova nao encontrada' });
    }

    if (prova === false) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const result = await db.query(`
      SELECT
        u.username,
        u.email,
        r.acertos,
        r.total,
        r.percentual,
        u.xp,
        u.nivel,
        r.finalizada_em
      FROM respostas_provas_professor r
      JOIN usuarios u ON u.id = r.aluno_id
      WHERE r.prova_id = $1
      ORDER BY r.percentual DESC, r.finalizada_em ASC
    `, [prova.id]);

    const rows = result.rows || [];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FórmulaVest';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Resultados', {
      views: [{ state: 'frozen', ySplit: 4 }]
    });

    // Título
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Relatório de resultados — ${prova.titulo || 'Prova'}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 26;
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D91' } };
    });

    // Subtítulo com metadados
    sheet.mergeCells('A2:H2');
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value = `Código: ${prova.codigo || '—'}   •   Gerado em: ${new Date().toLocaleString('pt-BR')}   •   Total de participantes: ${rows.length}`;
    subtitleCell.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
    sheet.getRow(2).height = 18;

    sheet.getRow(3).height = 6;

    const headerRowIndex = 4;
    const headers = ['#', 'Nome', 'Email', 'Acertos', 'Total', 'Percentual', 'XP', 'Nível', 'Finalizada em'];
    const headerRow = sheet.getRow(headerRowIndex);
    headers.forEach((text, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = text;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5FCF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    });
    headerRow.height = 20;

    rows.forEach((row, index) => {
      const excelRow = sheet.addRow([
        index + 1,
        row.username || '',
        row.email || '',
        Number(row.acertos || 0),
        Number(row.total || 0),
        Number(row.percentual || 0) / 100,
        Number(row.xp || 0),
        Number(row.nivel || 0),
        row.finalizada_em ? new Date(row.finalizada_em) : null
      ]);

      excelRow.getCell(6).numFmt = '0.0%';
      excelRow.getCell(9).numFmt = 'dd/mm/yyyy hh:mm';
      excelRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } }
        };
      });

      if (index % 2 === 1) {
        excelRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FD' } };
        });
      }

      // destaque para os 3 primeiros colocados
      if (index === 0) {
        excelRow.getCell(2).font = { bold: true, color: { argb: 'FFB8860B' } };
      } else if (index === 1) {
        excelRow.getCell(2).font = { bold: true, color: { argb: 'FF888888' } };
      } else if (index === 2) {
        excelRow.getCell(2).font = { bold: true, color: { argb: 'FF8B5A2B' } };
      }
    });

    sheet.columns = [
      { width: 5 },
      { width: 26 },
      { width: 28 },
      { width: 10 },
      { width: 10 },
      { width: 12 },
      { width: 8 },
      { width: 8 },
      { width: 20 }
    ];

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: headers.length }
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="prova_${prova.id}_relatorio.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro gerar relatorio XLS' });
  }
});

// ======================
// PROFESSOR: PERIODOS / SALAS
// ======================
app.get('/professor/periodos', auth, async (req, res) => {
  try {
    if (
      !req.user.escola_id &&
      req.user.role !== 'formulavest_master' &&
      req.user.role !== 'empresa_admin'
    ) {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const params = [];
    let where = '';

    if (req.user.role === 'professor') {
      params.push(req.user.id);
      where = `
        WHERE p.id IN (
          SELECT s.periodo_id
          FROM salas s
          WHERE s.id IN (
            SELECT sala_id
            FROM professor_salas
            WHERE professor_id = $1
          )
          OR s.id = COALESCE(
            (SELECT sala_id FROM usuarios WHERE id = $1),
            NULL
          )
        )
      `;
    } else if (req.user.role === 'empresa_admin') {
      params.push(req.user.empresa_id);
      where = `WHERE p.escola_id IN (
        SELECT id FROM escolas WHERE empresa_id = $1
      )`;
    } else if (req.user.escola_id) {
      params.push(req.user.escola_id);
      where = `WHERE p.escola_id = $1`;
    }

    const result = await db.query(`
      SELECT *
      FROM periodos p
      ${where}
      ORDER BY p.id DESC
    `, params);

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
        SELECT s.*, p.nome as periodo_nome
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
    if (req.user.role !== 'aluno') {
      return res.status(403).json({ error: 'Sem permissao' });
    }

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
    const respostasAtual = Array.isArray(respostas) ? respostas.slice(0, provaAtiva.questoes.length) : [];
    const indice = Number.isInteger(Number(perguntaIndex)) ? Number(perguntaIndex) : respostasAtual.length - 1;

    if (typeof resposta === 'string' && indice >= 0 && indice < provaAtiva.questoes.length) {
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
    if (req.user.role !== 'aluno') {
      return res.status(403).json({ error: 'Sem permissao' });
    }

    const { respostas } = req.body;

    if (!Array.isArray(respostas) || respostas.length === 0) {
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

// exportar estatísticas por período (XLSX)
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

    const periodoInfo = await db.query('SELECT nome FROM periodos WHERE id = $1', [periodoId]);
    const periodoNome = periodoInfo.rows[0]?.nome || `Periodo ${periodoId}`;

    const buffer = await gerarPlanilhaEstatisticas({
      titulo: `Estatísticas do período — ${periodoNome}`,
      linhas: rows.rows
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="periodo_${periodoId}_export.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro exportar periodo' });
  }
});

// exportar por sala (XLSX)
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

    const salaInfo = await db.query('SELECT nome FROM salas WHERE id = $1', [salaId]);
    const salaNome = salaInfo.rows[0]?.nome || `Sala ${salaId}`;

    const buffer = await gerarPlanilhaEstatisticas({
      titulo: `Estatísticas da sala — ${salaNome}`,
      linhas: rows.rows
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sala_${salaId}_export.xlsx"`);
    return res.send(buffer);
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
