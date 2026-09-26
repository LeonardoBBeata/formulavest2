module.exports = function registerHealthRoutes(app, deps = {}) {
  const { db, statusEmail } = deps;

  const getEmailStatus = () => {
    if (typeof statusEmail === 'function') {
      return statusEmail();
    }
    return { configured: false, provider: 'unknown' };
  };

  app.get('/', (_, res) => {
    res.send('API ONLINE');
  });

  app.get('/health/db', async (_, res) => {
    try {
      await db.query('SELECT 1');
      res.json({
        ok: true,
        database: 'online'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        ok: false,
        database: 'offline'
      });
    }
  });

  app.get('/health', async (_, res) => {
    try {
      await db.query('SELECT 1');
      res.json({
        ok: true,
        database: 'online',
        email: getEmailStatus(),
        timestamp: new Date().toISOString()
      });
    } catch (_) {
      res.status(503).json({
        ok: false,
        database: 'offline',
        email: getEmailStatus(),
        timestamp: new Date().toISOString()
      });
    }
  });
};
