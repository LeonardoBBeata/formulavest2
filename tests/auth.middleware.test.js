jest.mock('../config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

process.env.JWT_SECRET = 'test-secret-for-auth-middleware';

const { auth } = require('../middlewares/auth');

function createRequest(token) {
  return {
    headers: { authorization: `Bearer ${token}` },
    cookies: {}
  };
}

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
}

function createToken() {
  return jwt.sign(
    { id: 1, token_version: 0 },
    process.env.JWT_SECRET,
    {
      expiresIn: '1m',
      issuer: 'formulavest',
      audience: 'formulavest-web',
      algorithm: 'HS256'
    }
  );
}

describe('middleware de autenticação', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  test('propaga falhas de banco como erro de servidor, não como token inválido', async () => {
    const databaseError = new Error('database unavailable');
    db.query.mockRejectedValue(databaseError);
    const req = createRequest(createToken());
    const res = createResponse();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).toHaveBeenCalledWith(databaseError);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejeita token inválido sem consultar o banco', async () => {
    const req = createRequest('invalid-token');
    const res = createResponse();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalido' });
    expect(db.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
