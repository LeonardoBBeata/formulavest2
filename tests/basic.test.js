const request = require('supertest');
const app = require('../server');

describe('Basic server', () => {
  test('GET / should return 200', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
  });

  test('respostas públicas recebem cabeçalhos de proteção', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('rota inexistente não expõe páginas estáticas por engano', async () => {
    const res = await request(app).get('/nao-existe');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Rota não encontrada' });
  });

  test('rota autenticada rejeita chamadas sem token', async () => {
    const res = await request(app).get('/me');
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token ausente' });
  });
});
