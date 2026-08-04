require('dotenv').config();

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
const { enviarEmail } = require('./services/email');
const { chamarIA, extrairJSONSeguro } = require('./services/ia');

const registerHealthRoutes = require('./routes/health');
const registerAuthRoutes = require('./routes/auth');
const registerUserRoutes = require('./routes/user');
const registerAdminRoutes = require('./routes/admin');
const registerProvasRoutes = require('./routes/provas');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');

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

// Configure Helmet with a relaxed CSP that allows the Chart.js CDN used in the frontend.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", process.env.APP_URL || 'http://localhost:3000'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    }
  })
);
app.use(compression());
app.use(cookieParser());
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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.use('/uploads', express.static('public/uploads', {
  maxAge: isProd ? 1000 * 60 * 60 * 24 * 30 : 0,
  immutable: isProd
}));
app.use(express.static('public', {
  maxAge: isProd ? 1000 * 60 * 60 * 24 * 7 : 0,
  immutable: isProd
}));
app.use(
  ['/register', '/verificar-email', '/forgot-password', '/reset-password', '/login-iniciar', '/login-confirmar'],
  authLimiter
);

const routeDeps = {
  PDFDocument,
  auth,
  bcrypt,
  cache,
  chamarIA,
  crypto,
  db,
  enviarEmail,
  extrairJSONSeguro,
  gerarToken,
  loginLimiter,
  permitir,
  upload,
  validator
};

registerHealthRoutes(app, routeDeps);
registerAuthRoutes(app, routeDeps);
registerUserRoutes(app, routeDeps);
registerAdminRoutes(app, routeDeps);
registerProvasRoutes(app, routeDeps);


// export app for testing
module.exports = app;

if (require.main === module) {
  initDB()
    .then(async dbReady => {
      if (dbReady) {
        await criarAdmMaster();
      } else {
        logger.warn('Servidor iniciando sem banco de dados. Algumas rotas podem ficar indisponíveis até o PostgreSQL voltar.');
      }

      const server = app.listen(PORT, () => {
        logger.info(`Servidor rodando na porta ${PORT}`);
      });

    const shutdown = async signal => {
      console.log(`Encerrando servidor (${signal})...`);
      server.close(async () => {
        try {
          await db.end();
          console.log('Conexões do banco encerradas');
        } catch (err) {
          console.error('Erro ao encerrar conexões do banco:', err);
        } finally {
          process.exit(0);
        }
      });

      setTimeout(() => {
        console.error('Forçando encerramento do servidor');
        process.exit(1);
      }, 10000);
    };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch(err => {
      logger.error('Erro ao iniciar servidor:', err);
      process.exit(1);
    });
}
