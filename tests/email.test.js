jest.mock('axios', () => ({
  post: jest.fn()
}));

const axios = require('axios');
const express = require('express');
const request = require('supertest');
const registerAuthRoutes = require('../routes/auth');
const { enviarEmail, statusEmail } = require('../services/email');

describe('serviço de email Resend', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.TEMPORARY_OTP_DISPLAY;
    delete process.env.EXPOSE_TEST_CODES;
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_EMAIL = 'no-reply@example.test';
    process.env.RESEND_FROM_NAME = 'FormulaVest Test';
    axios.post.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('envia email transacional à API Resend com remetente e conteúdo', async () => {
    axios.post.mockResolvedValue({ data: { id: 'message-123' } });

    const result = await enviarEmail(
      'aluno@example.test',
      'Código de verificação',
      'Código: <123>\nUse com segurança.'
    );

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      {
        from: 'FormulaVest Test <no-reply@example.test>',
        to: ['aluno@example.test'],
        subject: 'Código de verificação',
        text: 'Código: <123>\nUse com segurança.',
        html: '<p>Código: &lt;123&gt;<br>Use com segurança.</p>'
      },
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer test-api-key' }),
        timeout: 10000
      })
    );
    expect(result).toEqual({ ok: true, id: 'message-123' });
  });

  test('retorna falha quando a API Resend rejeita a mensagem', async () => {
    axios.post.mockRejectedValue(new Error('Resend unavailable'));

    await expect(enviarEmail('aluno@example.test', 'Assunto', 'Texto')).resolves.toEqual({
      ok: false,
      reason: 'provider'
    });
    expect(statusEmail()).toEqual({ configured: true, provider: 'resend' });
  });

  test('nao tenta enviar sem as credenciais obrigatórias', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(enviarEmail('aluno@example.test', 'Assunto', 'Texto')).resolves.toEqual({
      ok: false,
      reason: 'config'
    });
    expect(statusEmail()).toEqual({ configured: false, provider: 'resend' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('mantem o modo console somente fora de produção', async () => {
    process.env.EMAIL_PROVIDER = 'console';
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});

    await expect(enviarEmail('aluno@example.test', 'Assunto', 'Texto')).resolves.toEqual({
      ok: true,
      simulated: true
    });
    expect(statusEmail()).toEqual({ configured: true, provider: 'console', simulated: true });

    process.env.NODE_ENV = 'production';
    await expect(enviarEmail('aluno@example.test', 'Assunto', 'Texto')).resolves.toEqual({
      ok: false,
      reason: 'provider'
    });
    expect(statusEmail()).toEqual({ configured: false, provider: 'console', simulated: false });
    log.mockRestore();
  });

  test.each([
    ['a entrega falha', { ok: false, reason: 'provider' }],
    ['o envio é simulado', { ok: true, simulated: true }]
  ])('recuperação de senha não confirma envio quando %s', async (_cenario, delivery) => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
    };
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, {
      authLimiter: (req, res, next) => next(),
      bcrypt: require('bcrypt'),
      crypto: require('crypto'),
      db,
      enviarEmail: jest.fn().mockResolvedValue(delivery),
      gerarToken: jest.fn(),
      loginLimiter: (req, res, next) => next(),
      validator: require('validator')
    });

    const response = await request(app)
      .post('/forgot-password')
      .send({ email: 'aluno@example.test' });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/Não foi possível enviar/);
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[2][0]).toMatch(/reset_token = NULL, reset_expira = NULL/);
  });

  test('cadastro com envio simulado retorna o código temporário para a interface', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EXPOSE_TEST_CODES = 'true';
    process.env.EMAIL_PROVIDER = 'console';
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 7, email: 'aluno@example.test' }] })
        .mockResolvedValueOnce({ rows: [] })
    };
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, {
      authLimiter: (req, res, next) => next(),
      bcrypt: { hash: jest.fn().mockResolvedValue('password-hash') },
      crypto: require('crypto'),
      db,
      enviarEmail,
      gerarToken: jest.fn(),
      loginLimiter: (req, res, next) => next(),
      validator: require('validator')
    });

    try {
      const response = await request(app)
        .post('/register')
        .send({ username: 'aluno_teste', email: 'aluno@example.test', senha: 'senha-teste-123' });

      expect(response.status).toBe(200);
      expect(response.body.dev_codigo).toMatch(/^\d{6}$/);
      expect(response.body.envio_simulado).toBe(true);
      expect(response.body.email_enviado).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  test('nunca retorna o código de autenticação quando NODE_ENV é production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPOSE_TEST_CODES = 'true';
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 8, email: 'aluno@example.test' }] })
        .mockResolvedValueOnce({ rows: [] })
    };
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, {
      authLimiter: (req, res, next) => next(),
      bcrypt: { hash: jest.fn().mockResolvedValue('password-hash') },
      crypto: require('crypto'),
      db,
      enviarEmail: jest.fn().mockResolvedValue({ ok: true, simulated: true }),
      gerarToken: jest.fn(),
      loginLimiter: (req, res, next) => next(),
      validator: require('validator')
    });

    const response = await request(app)
      .post('/register')
      .send({ username: 'aluno_teste', email: 'aluno@example.test', senha: 'senha-teste-123' });

    expect(response.status).toBe(200);
    expect(response.body.envio_simulado).toBe(true);
    expect(response.body.dev_codigo).toBeUndefined();
  });

  test('exibe códigos em production apenas com o flag temporário explícito', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TEMPORARY_OTP_DISPLAY = 'true';
    process.env.EMAIL_PROVIDER = 'console';
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 9, email: 'aluno@example.test' }] })
        .mockResolvedValueOnce({ rows: [] })
    };
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, {
      authLimiter: (req, res, next) => next(),
      bcrypt: { hash: jest.fn().mockResolvedValue('password-hash') },
      crypto: require('crypto'),
      db,
      enviarEmail,
      gerarToken: jest.fn(),
      loginLimiter: (req, res, next) => next(),
      validator: require('validator')
    });

    const response = await request(app)
      .post('/register')
      .send({ username: 'aluno_teste', email: 'aluno@example.test', senha: 'senha-teste-123' });

    expect(response.status).toBe(200);
    expect(response.body.dev_codigo).toMatch(/^\d{6}$/);
    expect(response.body.envio_simulado).toBe(true);
    expect(response.body.email_enviado).toBe(false);
    expect(statusEmail()).toEqual({
      configured: true,
      provider: 'console',
      simulated: true
    });
  });
});
