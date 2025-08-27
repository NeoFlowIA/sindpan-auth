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
