# Revisao de seguranca e checklist de deploy

## Estado da revisao

Revisao atualizada apos o hardening das rotas. Foram adicionados escopo de escola/empresa para exports e gestao de provas, confirmação de email, revogacao de sessoes, consumo de codigos de uso unico, transacao na prova normal, cotas de IA, limites de upload e constraints de nomes. Isto nao substitui teste de intrusao nem validacao de deploy em infraestrutura real.

## Bloqueadores antes de producao

- [ ] Executar migrations num clone/restauro recente da base de producao e validar a aplicacao antes do deploy.
- [ ] Revisar duplicatas legadas de periodos/salas: a migration 011 preserva IDs/relacionamentos e acrescenta `[registro-ID]` aos nomes duplicados antes de instalar índices únicos.
- [ ] Confirmar que `DATABASE_URL` aponta para o host correto e usa credenciais dedicadas. Para PostgreSQL gerenciado, definir `DATABASE_SSL=true` e validar certificado; para o Postgres interno do Compose, manter `DATABASE_SSL=false` somente com a porta do banco privada e nao publicada.
- [ ] Trocar `JWT_SECRET`, `MASTER_PASSWORD`, senha do banco, SMTP e demais chaves por segredos aleatorios fora do repositorio; nunca reutilizar os valores locais.
- [ ] Restringir `APP_URL`/CORS ao dominio final e configurar o proxy TLS para que `trust proxy` corresponda exatamente a topologia real.
- [ ] Configurar SMTP de producao e provar cadastro, verificacao, recuperacao de senha e entrega de email sem fallback de desenvolvimento.
- [ ] Fazer backup consistente antes da migration e executar um teste de restauracao em ambiente isolado.
- [ ] Garantir que `EXPOSE_TEST_CODES` nao esteja ativo e que `NODE_ENV=production` esteja definido.

## Deploy com Docker Compose

1. Preparar `.env` fora do controle de versao. Definir `POSTGRES_PASSWORD`, `DATABASE_URL` com host `postgres`, `JWT_SECRET`, `MASTER_PASSWORD`, `APP_URL` e credenciais de email. O Compose de producao usa `DATABASE_SSL=false` apenas para seu banco interno privado; ao usar PostgreSQL gerenciado, configurar `DATABASE_SSL=true`.
2. Fazer backup da base e validar o artefato/imagem da aplicacao.
3. Iniciar o banco e esperar o healthcheck:

```bash
docker compose -f docker-compose.prod.yml up -d postgres
```

4. Executar migrations uma vez, com o mesmo ambiente e a mesma imagem/codigo que sera implantado:

```bash
docker compose -f docker-compose.prod.yml run --rm app npm run db:migrate
```

5. Confirmar que a migration `011_unique_school_names.sql` aparece em `schema_migrations`; validar as FKs `NOT VALID` e rever nomes legados ajustados. Índices únicos bloqueiam novas duplicatas.
6. Subir o servico e conferir `/health`, `/health/db`, logs e um fluxo de autenticacao real:

```bash
docker compose -f docker-compose.prod.yml up -d app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 app
```

7. Monitorar erros, latencia, conexoes do pool e armazenamento; manter procedimento de rollback para a imagem. Migrations futuras devem ser aditivas e compativeis com a versao anterior durante deploy gradual.

## Hardening implementado

- Codigos de verificacao/login sao armazenados como hash e login/reset consomem o valor de forma condicional/atomica.
- Mudanca de senha/email exige senha atual; email fica pendente ate confirmacao e `token_version` revoga JWTs antigos.
- Exports, listagem/criacao de provas e criacao de salas verificam tenant/escola; respostas de geracao nao incluem gabarito.
- Salvamento de prova deriva total/nota do gabarito, com XP e finalizacao na mesma transacao.
- Rotas de IA tem cota por usuario, redações/importações tem limites e DOCX e verificado por tamanho de expansao antes da extração.
- Runner de migrations aplica cada arquivo na mesma conexao/transacao; o startup normal exige a migration atual.

## Seguranca e arquitetura: pendencias

- Adicionar protecao CSRF explicita para operacoes autenticadas por cookie, com verificacao de `Origin`/token CSRF conforme a arquitetura final de frontend.
- Ampliar os testes de autorizacao para todos os fluxos de provas ao vivo, PDFs/XLSX, empresas e atribuicoes de professor; os testes adicionados cobrem os vetores principais, nao cada handler.
- Converter operacoes compostas de admin para transacoes: editar usuario e suas salas atribuídas, importar alunos e excluir empresa devem ser atomicas ou reportar resultados parciais de forma explicita.
- Validar uploads por conteudo/tipo/tamanho, armazenar fora da raiz publica quando possivel e servir com autorizacao; confirmar que arquivos pessoais nao ficam acessiveis por URL previsivel.
- Adotar testes de migrations em banco vazio e banco legado, incluindo falha no meio da migration, concorrencia entre runners e restauracao de backup.
- Mover schema bootstrap restante em `config/database.js` para migrations; `DB_AUTO_MIGRATE=true` deve ser usado apenas temporariamente em desenvolvimento legado.
- Rever retencao e acesso a logs, alertas, politica de backup, rotacao de segredos e plano de resposta a incidente.
- O container local `docker-compose.yml` usa credenciais padrao e publica a porta do banco; nunca o usar como configuracao de producao. Preferir `docker-compose.prod.yml`, sem publicar a porta do PostgreSQL.

## Validacao minima antes de release

- [ ] `npm test -- --runInBand` e executar a integracao com `RUN_DB_TESTS=true` e PostgreSQL disponivel.
- [ ] `npm run lint`.
- [ ] `npm run db:migrate` em banco vazio e num clone anonimizando da base existente.
- [ ] Testar login, logout, refresh, reset de senha, bloqueio de conta e expiracao de codigos.
- [ ] Testar acesso negado entre duas empresas, duas escolas da mesma empresa e salas nao atribuídas a um professor.
- [ ] Testar limites de upload, rate limits e CSP nas paginas principais.
- [ ] Confirmar healthchecks, TLS, backup/restauracao e shutdown sem conexoes residuais.
