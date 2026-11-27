const express = require('express');
const request = require('supertest');
const registerProvasRoutes = require('../routes/provas');

describe('rotas de geração assíncrona de provas', () => {
  let app;
  let savedJob;
  const generatedQuestions = [{
    enunciado: 'Questão de teste',
    materia: 'Matemática',
    opcoes: { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' },
    correta: 'C'
  }];

  beforeEach(() => {
    savedJob = null;
    app = express();
    app.use(express.json());
    const db = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('INSERT INTO exam_generation_jobs')) {
          savedJob = { id: params[0], userId: params[1], type: params[2], status: 'queued' };
          return { rows: [] };
        }
        if (sql.includes('SELECT id, tipo') && savedJob?.status === 'queued') {
          return Number(params[0]) === Number(savedJob.userId)
            ? { rows: [{ id: savedJob.id, tipo: savedJob.type }] }
            : { rows: [] };
        }
        if (sql.includes("WHERE id = $1 AND status = 'queued'")) return { rows: [] };
        if (sql.includes('SELECT id, status, progress, prova_id, error_message')) {
          if (!savedJob || Number(params[1]) !== Number(savedJob.userId)) return { rows: [] };
          return {
            rows: [{
              id: savedJob.id,
              status: savedJob.status || 'queued',
              progress: savedJob.progress || 0,
              prova_id: savedJob.status === 'completed' ? 42 : null,
              error_message: null
            }]
          };
        }
        if (sql.includes('SELECT questoes') && sql.includes('FROM provas_ativas')) {
          return { rows: [{ questoes: generatedQuestions }] };
        }
        return { rows: [] };
      }),
      connect: jest.fn()
    };
    const auth = (req, res, next) => {
      req.user = { id: Number(req.get('x-user-id') || 1) };
      next();
    };
    const middleware = (req, res, next) => next();
    registerProvasRoutes(app, {
      auth,
      aiLimiter: middleware,
      cache: { del: jest.fn() },
      db,
      extrairJSONSeguro: JSON.parse,
      chamarIA: jest.fn()
    });
  });

  test('inicia um trabalho persistente para geração do ENEM', async () => {
    const response = await request(app).post('/gerar-enem');
    const duplicate = await request(app).post('/gerar-enem');

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ status: 'queued', progress: 0 });
    expect(response.body.job_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(duplicate.status).toBe(202);
    expect(duplicate.body.job_id).toBe(response.body.job_id);
    expect(savedJob).toMatchObject({ userId: 1, type: 'enem' });
  });

  test('não inicia outro tipo de prova enquanto há uma geração ativa', async () => {
    await request(app).post('/gerar-enem');
    const conflict = await request(app).post('/gerar-provao');

    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatch(/outra geração/i);
  });

  test('retorna questões sem gabarito apenas ao dono da geração', async () => {
    savedJob = {
      id: '98b18c4f-4fa0-4fc6-9a2c-4da90ff840d6',
      userId: 1,
      type: 'enem',
      status: 'completed',
      progress: 90
    };

    const owner = await request(app)
      .get(`/geracao-prova/${savedJob.id}`)
      .set('x-user-id', '1');
    const otherUser = await request(app)
      .get(`/geracao-prova/${savedJob.id}`)
      .set('x-user-id', '2');

    expect(owner.status).toBe(200);
    expect(owner.body.questoes).toHaveLength(1);
    expect(owner.body.questoes[0]).not.toHaveProperty('correta');
    expect(otherUser.status).toBe(404);
  });
});
