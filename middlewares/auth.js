const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

const jwtOptions = {
  algorithms: ['HS256'],
  issuer: 'formulavest',
  audience: 'formulavest-web'
};

function gerarToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      empresa_id: user.empresa_id,
      escola_id: user.escola_id,
      sala_id: user.sala_id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d',
      issuer: jwtOptions.issuer,
      audience: jwtOptions.audience,
      algorithm: 'HS256'
    }
  );
}

function permitir(...roles) {
  return (req, res, next) => {
    if (req.user.role === 'formulavest_master') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Sem permissao'
      });
    }

    next();
  };
}

async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      error: 'Token ausente'
    });
  }

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Token invalido'
    });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, jwtOptions);
    const result = await db.query(
      `SELECT id, username, role, empresa_id, escola_id, sala_id, banido, verificado
       FROM usuarios WHERE id = $1`,
      [payload.id]
    );
    const user = result.rows[0];
    if (!user || user.banido || !user.verificado) {
      return res.status(401).json({ error: 'Sessao invalida' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      error: 'Token invalido'
    });
  }
}

module.exports = {
  auth,
  gerarToken,
  permitir
};
