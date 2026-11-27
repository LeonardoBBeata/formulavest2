const express = require('express');
const request = require('supertest');
const registerUserRoutes = require('../routes/user');

describe('rotas de progresso de estudo', () => {
  let app;
  let db;
  const progress = {
    activities: [],
    planDate: '2026-11-27',
    plan: [{ texto: 'Revisar matemática', feito: false }],
    goalsDate: '2026-11-27',
    goals: [],
    lessons: {}
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    db = {
      query: jest.fn(async sql => {
        if (sql.includes('SELECT progress, updated_at')) {
          return { rows: [{ progress, updated_at: '2026-11-27T12:00:00.000Z' }] };
        }
        return { rows: [{ updated_at: '2026-11-27T12:00:00.000Z' }] };
      })
    };
    const middleware = (req, res, next) => next();
    registerUserRoutes(app, {
      auth: (req, res, next) => {
        req.user = { id: 12, role: 'aluno' };
        next();
      },
      authLimiter: middleware,
      bcrypt: { compare: jest.fn(), hash: jest.fn() },
      db,
      enviarEmail: jest.fn(),
      upload: {
        single: () => middleware,
        validarAssinaturaImagem: jest.fn()
      },
      validator: { isEmail: jest.fn(() => true) }
    });
  });

  test('carrega o progresso da conta autenticada', async () => {
    const response = await request(app).get('/me/study-progress');

    expect(response.status).toBe(200);
    expect(response.body.progress).toEqual(progress);
    expect(response.body.updated_at).toBe('2026-11-27T12:00:00.000Z');
  });

  test('valida o progresso antes de persistir e aceita apenas a própria conta', async () => {
    const invalid = await request(app)
      .put('/me/study-progress')
      .send({ ...progress, activities: [{ date: 'not-a-date', kind: 'focus', minutes: 25 }] });
    expect(invalid.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();

    const saved = await request(app).put('/me/study-progress').send(progress);
    expect(saved.status).toBe(200);
    expect(saved.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(usuario_id)'),
      [12, JSON.stringify(progress)]
    );
  });
});
