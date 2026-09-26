require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido. Defina a chave secreta JWT no ambiente.');
}

const path = require('path');
const crypto = require('crypto');
const compression = require('compression');
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const PDFDocument = require('pdfkit');
const validator = require('validator');

const cache = require('./config/cache');
const { criarAdmMaster, db, initDB } = require('./config/database');
const { auth, gerarToken, permitir } = require('./middlewares/auth');
const logger = require('./utils/logger');
const upload = require('./middlewares/upload');
const { enviarEmail, statusEmail } = require('./services/email');
const { chamarIA, extrairJSONSeguro } = require('./services/ia');

const registerHealthRoutes = require('./routes/health');
const registerAuthRoutes = require('./routes/auth');
const registerUserRoutes = require('./routes/user');
const registerAdminRoutes = require('./routes/admin');
const registerProvasRoutes = require('./routes/provas');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';
let httpServer;

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
);

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/uploads/') || /\.(css|js|png|svg|ico)$/i.test(req.path)) return;
    logger.info({ method: req.method, path: req.path, status: res.statusCode, duration_ms: Date.now() - startedAt }, 'request');
  });
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas. Tente novamente mais tarde.'
  }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AI_MAX_REQUESTS_PER_HOUR) || 8,
  keyGenerator: req => `user:${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de solicitações de IA atingido. Tente novamente mais tarde.' }
});

const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas requisições. Tente novamente mais tarde.'
  }
});

app.use(compression());
app.use(cookieParser());
app.use(globalLimiter);
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.APP_URL || 'https://formulavest.onrender.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
      ];

      if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origem não permitida pelo CORS'));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.use('/uploads', express.static('public/uploads', {
  maxAge: isProd ? 1000 * 60 * 60 * 24 * 30 : 0,
  immutable: isProd,
  index: false,
  dotfiles: 'ignore'
}));
app.use(express.static('public', {
  maxAge: isProd ? 1000 * 60 * 60 * 24 * 7 : 0,
  immutable: isProd,
  index: false,
  dotfiles: 'ignore'
}));
app.use(
  ['/register', '/verificar-email', '/forgot-password', '/reset-password', '/login-iniciar', '/login-confirmar'],
  authLimiter
);

const routeDeps = {
  PDFDocument,
  aiLimiter,
  auth,
  bcrypt,
  cache,
  chamarIA,
  crypto,
  db,
  enviarEmail,
  statusEmail,
  extrairJSONSeguro,
  gerarToken,
  loginLimiter,
  authLimiter,
  permitir,
  upload,
  validator
};

registerHealthRoutes(app, routeDeps);
registerAuthRoutes(app, routeDeps);
registerUserRoutes(app, routeDeps);
registerAdminRoutes(app, routeDeps);
registerProvasRoutes(app, routeDeps);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande' });
  }
  if (err.message && err.message.includes('Apenas arquivos')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erro interno no servidor' });
});

async function closeApp() {
  try {
    if (httpServer && httpServer.listening) {
      await new Promise((resolve, reject) => {
        httpServer.close(err => (err ? reject(err) : resolve()));
      });
    }
  } catch (err) {
    console.error('Erro ao encerrar servidor HTTP:', err);
  }

  try {
    await db.end();
  } catch (err) {
    console.error('Erro ao encerrar conexões do banco:', err);
  }
}

async function startServer(port = PORT) {
  const dbReady = await initDB();
  if (dbReady) {
    await criarAdmMaster();
  } else {
    logger.warn('Servidor iniciando sem banco de dados. Algumas rotas podem ficar indisponíveis até o PostgreSQL voltar.');
  }

  if (httpServer && httpServer.listening) {
    return httpServer;
  }

  return new Promise((resolve) => {
    httpServer = app.listen(port, () => {
      logger.info(`Servidor rodando na porta ${port}`);
      resolve(httpServer);
    });
  });
}

const shutdown = async signal => {
  console.log(`Encerrando servidor (${signal})...`);
  try {
    await closeApp();
    console.log('Servidor e conexões do banco encerrados');
  } catch (err) {
    console.error('Erro ao encerrar aplicação:', err);
  } finally {
    process.exit(0);
  }
};

// export app for testing
module.exports = app;
module.exports.app = app;
module.exports.closeApp = closeApp;
module.exports.startServer = startServer;

if (require.main === module) {
  startServer()
    .then(() => {
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch(err => {
      logger.error('Erro ao iniciar servidor:', err);
      process.exit(1);
    });
}
