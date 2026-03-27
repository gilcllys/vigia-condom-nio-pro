# NFe Vigia - Gestao Condominial

Plataforma SaaS de gestao condominial com foco em fiscalizacao de documentos, ordens de servico, analise de risco de prestadores e transparencia financeira.

## Stack

| Camada | Tecnologia |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| **Backend** | Django 5.2 + Django REST Framework + Gunicorn |
| **Banco** | PostgreSQL 16 |
| **Auth** | Supabase GoTrue (proxy via backend) |
| **IA/OCR** | Anthropic Claude (extracao de NF e analise de risco) |
| **Pagamentos** | Pagar.me v5 |
| **Email** | Resend |

---

## Estrutura do Projeto

```
vigia-condom-nio-pro/
├── docker-compose.yml          # Stack completa (db + backend + frontend)
├── .env                        # Variaveis do Postgres (Docker Compose)
│
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh           # Roda migrations + inicia Gunicorn
│   ├── requirements.txt
│   ├── .env                    # Variaveis do backend (Django, Supabase, APIs)
│   ├── .env.example
│   ├── config/                 # Settings, URLs, WSGI
│   ├── core/                   # Usuarios, condos, auth, ViewSets centrais
│   ├── condos/                 # Chamados, OS, aprovacoes, orcamentos
│   ├── invoices/               # Notas fiscais, almoxarifado, estoque
│   ├── providers/              # Prestadores, contratos, analise de risco
│   ├── subscriptions/          # Billing/assinaturas
│   ├── notifications/          # Notificacoes
│   └── services/               # Integracao: Anthropic, Pagar.me, Resend, Supabase
│
└── frontend/
    ├── Dockerfile              # Build multi-stage (Node + Nginx)
    ├── nginx.conf              # SPA fallback + proxy /api/ -> backend
    ├── .env                    # VITE_API_BASE_URL
    └── src/
        ├── pages/              # 20 rotas (Dashboard, Login, OS, NF, etc.)
        ├── components/         # Componentes organizados por dominio
        ├── hooks/              # Custom hooks
        └── lib/                # API client, helpers
```

---

## Setup Inicial

### Pre-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose
- [Node.js 20+](https://nodejs.org/) (para dev local do frontend)
- [Python 3.12+](https://www.python.org/) (para dev local do backend)

### 1. Clonar o repositorio

```bash
git clone <URL_DO_REPO>
cd vigia-condom-nio-pro
```

### 2. Configurar variaveis de ambiente

**`.env` (raiz)** - Credenciais do Postgres para Docker Compose:

```bash
cp .env.example .env
# Editar se necessario (valores padrao ja funcionam para dev)
```

**`backend/.env`** - Configuracoes do Django e APIs externas:

```bash
cp backend/.env.example backend/.env
```

Preencha as variaveis em `backend/.env`:

| Variavel | Onde encontrar |
|---|---|
| `DJANGO_SECRET_KEY` | Gerar com: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API > anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API > service_role (secret) |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard > Settings > API > JWT Secret |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `PAGARME_API_KEY` | Painel Pagar.me > Configuracoes > Chaves de API |
| `PAGARME_WEBHOOK_SECRET` | Painel Pagar.me > Webhooks |
| `RESEND_API_KEY` | https://resend.com/api-keys |

**`frontend/.env`** - URL da API:

```env
VITE_API_BASE_URL="http://localhost:8000"
```

### 3. Subir com Docker Compose

```bash
docker compose up -d --build
```

Isso inicia 3 containers:

| Container | Porta | Descricao |
|---|---|---|
| `db` | `5432` | PostgreSQL 16 |
| `backend` | `8000` | Django + Gunicorn (roda migrations automaticamente) |
| `frontend` | `80` | Nginx servindo o React SPA + proxy `/api/` |

### 4. Verificar

```bash
# Status dos containers
docker compose ps

# Logs do backend
docker compose logs backend

# Acessar a aplicacao
open http://localhost
```

---

## Desenvolvimento Local (sem Docker)

### Backend

```bash
cd backend

# Criar e ativar virtualenv
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou: venv\Scripts\activate  # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar .env
cp .env.example .env
# Editar DATABASE_URL para apontar para seu Postgres local

# Rodar migrations
python manage.py migrate

# Iniciar servidor de dev
python manage.py runserver
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de dev (porta 8080)
npm run dev
```

---

## Comandos Uteis

### Docker

```bash
# Subir tudo
docker compose up -d --build

# Parar tudo
docker compose down

# Parar e remover volumes (apaga o banco)
docker compose down -v

# Ver logs em tempo real
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db

# Status dos containers
docker compose ps

# Restart de um servico
docker compose restart backend

# Rebuild de um servico especifico
docker compose up -d --build backend
```

### Django (dentro do container)

```bash
# Rodar migrations
docker compose exec backend python manage.py migrate

# Criar migrations apos alterar models
docker compose exec backend python manage.py makemigrations

# Check do Django (validacao)
docker compose exec backend python manage.py check

# Shell do Django
docker compose exec backend python manage.py shell

# Coletar arquivos estaticos
docker compose exec backend python manage.py collectstatic --noinput

# Gerar novo SECRET_KEY
docker compose exec backend python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### Banco de Dados

```bash
# Acessar psql dentro do container
docker compose exec db psql -U nfevigia -d nfevigia

# Listar tabelas
docker compose exec db psql -U nfevigia -d nfevigia -c "\dt"

# Listar schemas
docker compose exec db psql -U nfevigia -d nfevigia -c "\dn"

# Backup do banco
docker compose exec db pg_dump -U nfevigia nfevigia > backup.sql

# Restaurar backup
docker compose exec -T db psql -U nfevigia nfevigia < backup.sql
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Servidor de dev (http://localhost:8080)
npm run dev

# Build de producao
npm run build

# Preview do build de producao
npm run preview

# Lint
npm run lint

# Testes
npm run test

# Testes em modo watch
npm run test:watch
```

---

## Arquitetura da API

Todos os endpoints ficam sob `/api/`. O Nginx do frontend faz proxy de `/api/*` para o backend.

### Autenticacao (`/api/auth/`)

| Metodo | Endpoint | Descricao |
|---|---|---|
| POST | `/api/auth/login/` | Login (email + senha) |
| POST | `/api/auth/signup/` | Cadastro |
| POST | `/api/auth/logout/` | Logout |
| POST | `/api/auth/refresh/` | Renovar token JWT |
| POST | `/api/auth/forgot-password/` | Recuperacao de senha |
| PUT | `/api/auth/update-user/` | Atualizar usuario (senha, metadata) |
| GET | `/api/auth/user/` | Dados do usuario autenticado |
| GET | `/api/auth/session/` | Sessao atual |

**MFA (TOTP):**

| Metodo | Endpoint | Descricao |
|---|---|---|
| GET | `/api/auth/mfa/factors/` | Listar fatores MFA |
| POST | `/api/auth/mfa/enroll/` | Cadastrar TOTP |
| POST | `/api/auth/mfa/challenge/` | Criar desafio MFA |
| POST | `/api/auth/mfa/verify/` | Verificar codigo TOTP |
| DELETE | `/api/auth/mfa/unenroll/` | Remover fator MFA |
| GET | `/api/auth/mfa/aal-level/` | Nivel AAL + check sindico |

### Dados (`/api/data/`)

Todos os endpoints de dados usam ViewSets do DRF com autenticacao JWT.

| Recurso | Endpoint | Operacoes |
|---|---|---|
| Usuarios | `/api/data/users/` | GET (me, by-auth-id) |
| Condominios | `/api/data/condos/` | GET, POST, PATCH (my, billing, financial-config, switch) |
| Moradores | `/api/data/residents/` | GET, POST, PUT, DELETE |
| Vinculos usuario-condo | `/api/data/user-condos/` | GET, POST, PATCH (change-role) |
| Ordens de Servico | `/api/data/service-orders/` | GET, POST, PATCH |
| Fotos da OS | `/api/data/service-orders/<id>/photos/` | GET, POST |
| Atividades da OS | `/api/data/service-orders/<id>/activities/` | GET, POST |
| Materiais da OS | `/api/data/service-order-materials/` | GET, POST, DELETE |
| Chamados | `/api/data/tickets/` | GET, POST, PATCH |
| Notas Fiscais | `/api/data/fiscal-documents/` | GET, POST |
| Aprovacoes de NF | `/api/data/approvals/` | GET, POST, PATCH |
| Itens de NF | `/api/data/fiscal-document-items/` | GET, POST |
| Aprovacoes de OS | `/api/data/os-approvals/` | GET, POST, PATCH |
| Orcamentos | `/api/data/budgets/` | GET, POST, DELETE |
| Prestadores | `/api/data/providers/` | GET, POST, PATCH |
| Contratos | `/api/data/contracts/` | GET, POST, PATCH, DELETE |
| Categorias de estoque | `/api/data/stock-categories/` | GET, POST |
| Itens de estoque | `/api/data/stock-items/` | GET, POST, PATCH |
| Movimentacoes de estoque | `/api/data/stock-movements/` | GET, POST |
| Logs de atividade | `/api/data/activity-logs/` | GET, POST |
| Dashboard | `/api/data/dashboard/` | GET (stats) |
| Storage (upload) | `/api/data/storage/` | POST (upload), GET (file) |
| Cadastro completo | `/api/data/signup-register/` | POST |
| Aprovacoes pendentes | `/api/data/pending-user-approvals/` | GET |

### Outros modulos

| Modulo | Base | Descricao |
|---|---|---|
| Subscriptions | `/api/subscriptions/` | Checkout, webhooks Pagar.me, gerenciamento de plano |
| Invoices | `/api/invoices/` | OCR de NF via Claude AI, processamento fiscal |
| Providers | `/api/providers/` | Analise de risco AI, consulta CNPJ |
| Condos | `/api/condos/` | Convites, links de acesso |
| Notifications | `/api/notifications/` | Envio de emails de aprovacao via Resend |

---

## Banco de Dados

PostgreSQL 16 com todas as tabelas no schema `public`. Todas as PKs sao UUID v4.

### Tabelas (23)

**Core:** `condos`, `condo_financial_config`, `users`, `user_condos`, `user_sessions`, `residents`, `activity_logs`

**Condos:** `tickets`, `service_orders`, `service_order_photos`, `service_order_materials`, `service_order_activities`, `approvals`, `budgets`

**Invoices:** `fiscal_documents`, `fiscal_document_approvals`, `fiscal_document_items`, `stock_categories`, `stock_items`, `stock_movements`

**Providers:** `providers`, `provider_risk_analysis`, `contracts`

---

## Portas

| Servico | Porta | Variavel de env |
|---|---|---|
| Frontend (Nginx) | 80 | `FRONTEND_PORT` |
| Backend (Gunicorn) | 8000 | `BACKEND_PORT` |
| PostgreSQL | 5432 | `DB_PORT` |
| Frontend dev (Vite) | 8080 | — |

---

## Troubleshooting

### Containers nao sobem

```bash
# Verificar logs
docker compose logs backend
docker compose logs db

# Verificar se as portas estao livres
lsof -i :80 -i :8000 -i :5432
```

### Erro de migration

```bash
# Resetar banco (apaga tudo)
docker compose down -v
docker compose up -d --build
```

### Erro de build do frontend

```bash
# Limpar cache do Docker
docker builder prune -f

# Rebuild sem cache
docker compose build --no-cache frontend
```

### Backend nao conecta no banco

```bash
# Verificar se o Postgres esta healthy
docker compose ps

# Testar conexao
docker compose exec db psql -U nfevigia -d nfevigia -c "SELECT 1;"
```
