const request = require('supertest');
const app = require('./server');
const { initDB, db } = require('./config/database');

(async () => {
  const ok = await initDB();
  console.log('db-ready', ok);

  const email = 'debug-' + Date.now() + '@example.test';
  const username = 'debug_' + Date.now();

  const r1 = await request(app).post('/register').send({ username, email, senha: 'senha-de-teste-123' });
  console.log('register', r1.statusCode, JSON.stringify(r1.body));

  const code = r1.body.dev_codigo;
  const r2 = await request(app).post('/verificar-email').send({ email, codigo: code });
  console.log('verify', r2.statusCode, JSON.stringify(r2.body));

  const r3 = await request(app).post('/login-iniciar').send({ email, senha: 'senha-de-teste-123' });
  console.log('login-iniciar', r3.statusCode, JSON.stringify(r3.body));

  const r4 = await request(app).post('/login-confirmar').send({ email, senha: 'senha-de-teste-123', codigo: r3.body.dev_codigo });
  console.log('login-confirmar', r4.statusCode, JSON.stringify(r4.body));
  console.log('cookies', r4.headers['set-cookie']);

  const cookie = r4.headers['set-cookie'] && r4.headers['set-cookie'].find(c => c.startsWith('accessToken='));
  if (cookie) {
    const r5 = await request(app).get('/me').set('Cookie', cookie);
    console.log('me', r5.statusCode, JSON.stringify(r5.body));
  }

  await db.end();
})().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
