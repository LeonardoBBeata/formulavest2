module.exports = function registerHealthRoutes(app, deps = {}) {
  const { db } = deps;

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
};
