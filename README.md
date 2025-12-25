## SSVP — Controle de Assistidos (Supabase + Local)

Este app roda **100% local** (localStorage) e, quando configurado, sincroniza com o **Supabase** usando **Supabase Auth** + **tabelas com RLS por usuário**.

### Rodar localmente

- **Pré-requisito**: Node.js

1. Instale as dependências:

```bash
npm install
```

2. Rode o app:

```bash
npm run dev
```

### Configurar Supabase (Auth + Banco)

#### 1) Crie um projeto no Supabase

No Supabase, crie um projeto e habilite o provider de **Email/Password** em **Authentication**.

#### 2) Crie as tabelas com RLS

No app, vá em **Configurações** e copie/execute o SQL (em **SQL Editor**) para criar:
- `families`
- `members`
- `visits`
- `deliveries`

Todas com `user_id` + **RLS** para cada usuário ver apenas seus próprios registros.

#### 3) Informe `URL` e `Anon Key`

Você pode configurar de duas formas:

- **Pelo app**: em **Configurações**, cole `Project URL` e `anon public key` (fica em **Project Settings → API**).
- **Por variável de ambiente**: use como referência o arquivo `supabase.env.example` e crie as variáveis no seu ambiente:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Como funciona a sincronização

- Sem Supabase configurado: o app usa apenas **DB Local**.
- Com Supabase configurado e usuário logado: o app faz **sync automático** (debounced) das tabelas por usuário.
