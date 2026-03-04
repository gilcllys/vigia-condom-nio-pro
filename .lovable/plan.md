
## NFe Vigia SaaS — Plano de Implementação

### Visão Geral
Aplicação multi-tenant de gestão condominial com autenticação via Supabase, toda em Português (Brasil). Sem landing page — o usuário já entra na tela de login.

### 1. Autenticação
- Tela de **Login** e **Cadastro** (email/senha)
- Tela de **Recuperação de senha** e página `/redefinir-senha`
- Proteção de rotas — apenas usuários autenticados acessam o app

### 2. Estrutura Multi-Tenant (Banco de Dados)
- Tabela **condominios** — cada condomínio é um tenant
- Tabela **profiles** — dados do usuário (nome, telefone, avatar), vinculado a `auth.users`
- Tabela **user_roles** — papéis (admin, sindico, morador) com enum `app_role`
- Tabela **condominio_members** — associação usuário ↔ condomínio, com RLS isolando dados por condomínio
- Políticas RLS em todas as tabelas para isolamento de dados entre condomínios

### 3. Layout Autenticado
- **Sidebar** com navegação lateral (logo, menu, perfil do usuário)
- **Dashboard** inicial com placeholder de boas-vindas
- Menu com itens: Dashboard, Condomínios, Moradores, Configurações
- **Seletor de condomínio** no topo (para usuários com acesso a múltiplos condomínios)
- Botão de logout

### 4. Páginas Iniciais (Estrutura Limpa)
- `/login` — Tela de login
- `/cadastro` — Tela de registro
- `/dashboard` — Painel principal (conteúdo placeholder)
- `/condominios` — Lista de condomínios do usuário
- `/configuracoes` — Perfil e preferências do usuário

### 5. Design
- Visual limpo e profissional com Tailwind/shadcn
- Cores neutras, layout responsivo
- Toda interface em Português (BR)
