Quick PostgreSQL setup for local development

1) Using Docker Compose (project already contains docker-compose.yml):

```bash
# start postgres container
docker compose up -d postgres

# view logs if needed
docker compose logs -f postgres
```

2) Copy `.env.example` to `.env` and adjust values if needed. Default file already points to:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/formulavest
DATABASE_SSL=false
JWT_SECRET=troque_por_uma_chave_grande_e_secreta
MASTER_PASSWORD=troque_por_uma_senha_forte
```

3) Install dependencies and apply versioned migrations:

```bash
npm install
npm run db:migrate
```

4) Start the server after migrations succeed:

```bash
npm run dev
```

The server checks that the latest required migration is applied and refuses to start against an incomplete schema. For local development, use `DATABASE_SSL=false`; production must use TLS with certificate verification enabled. The master admin is created on startup if `MASTER_PASSWORD` is set.

If you prefer to provide individual PG_* variables, set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` instead of `DATABASE_URL`.
