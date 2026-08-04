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

3) Install dependencies and start server:

```bash
npm install
npm run dev
```

4) On first run the server will initialize the DB schema and create a master admin if `MASTER_PASSWORD` is set.

If you prefer to provide individual PG_* variables, set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` instead of `DATABASE_URL`.
