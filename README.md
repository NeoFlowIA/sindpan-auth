# SINDPAN Auth API — Dockerfile Only

API minimalista de **cadastro e login** com dois papéis: **padaria** e **sindicato (admin)**.
> Esta versão fornece **apenas Dockerfile**. Conecte em um Postgres já existente.

## Build da imagem
```bash
docker build -t sindpan-auth:latest .
```

## Rodando o container (exemplos)

### 1) Usando arquivo .env
Edite `.env.example` e salve como `.env`, então:
```bash
docker run --name sindpan-auth \
  --env-file .env \
  -p 8080:8080 \
  sindpan-auth:latest
```

### 2) Passando variáveis inline
```bash
docker run --name sindpan-auth \
  -e JWT_SECRET="troque-isto" \
  -e DB_HOST="db.meu-prov" -e DB_PORT=5432 \
  -e DB_USER="user" -e DB_PASSWORD="pass" -e DB_NAME="sindpan_auth" \
  -e DB_SSL=true \
  -p 8080:8080 \
  sindpan-auth:latest
```

### 3) Usando DATABASE_URL
```bash
docker run --name sindpan-auth \
  -e JWT_SECRET="troque-isto" \
  -e DATABASE_URL="postgres://user:pass@host:5432/sindpan_auth" \
  -e DB_SSL=true \
  -p 8080:8080 \
  sindpan-auth:latest
```

## Endpoints
- `POST /auth/register` — `{ email, password, bakery_name? }`
- `POST /auth/login` — `{ email, password }`
- `GET /auth/me` — Authorization: `Bearer <token>`

## Admin opcional
Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` para criar um admin automático na subida.

## Observações
- Certifique-se de que o banco esteja acessível **a partir do container** (VPC/VPN/Segurança/Firewall).
- Se seu provedor exigir SSL, use `DB_SSL=true`.

## Seed seguro de cupons

> ⚠️ **Importante:** o seed **nunca** altera nem remove cupons já atribuídos. Por padrão roda em _dry-run_. Leia tudo antes de executar.

1. Configure um token forte no `.env`:
   ```env
   SEED_CUPONS_TOKEN=run-me-once-abc-123-def-xyz
   ```
2. Opcionalmente, defina as variáveis de conexão (`DATABASE_URL` ou `DB_*`) como já feito para a API.
3. Execute os comandos abaixo conforme necessário:

```bash
# Dry-run (mostra quantas linhas faltam, não altera nada)
SEED_CUPONS_TOKEN=run-me-once-abc-123-def-xyz npm run db:seed:cupons

# Execução segura em staging (com backup das linhas disponíveis)
SEED_CUPONS_TOKEN=run-me-once-abc-123-def-xyz npm run db:seed:cupons -- --confirm-seed --backup

# Produção (apenas com guarda explícita)
NODE_ENV=production SEED_CUPONS_ALLOW_PROD=yes \
  SEED_CUPONS_TOKEN=run-me-once-abc-123-def-xyz \
  npm run db:seed:cupons -- --confirm-seed
```

### Salvaguardas implementadas

- Dry-run padrão com relatório detalhado (totais, séries que faltam, placeholders existentes).
- Exige `--confirm-seed` **e** `SEED_CUPONS_TOKEN` (≥24 caracteres) para inserir.
- Bloqueia execução em `NODE_ENV=production` sem `SEED_CUPONS_ALLOW_PROD=yes`.
- Inserção idempotente via anti-join, em lotes de 10.000 linhas.
- `--backup` gera CSV com cupons disponíveis antes da inserção (`/tmp/cupons-backup-<timestamp>.csv`).
- Nunca executa `DELETE`/`UPDATE` em linhas existentes e insere apenas placeholders (`cliente_id` e `padaria_id` nulos, `status='disponivel'`).
- Analisa a tabela ao final para atualizar estatísticas (`ANALYZE`).
