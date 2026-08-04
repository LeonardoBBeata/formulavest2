const jwt = require('jsonwebtoken');

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
      expiresIn: '7d'
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

function auth(req, res, next) {
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
    req.user = jwt.verify(token, process.env.JWT_SECRET);
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
