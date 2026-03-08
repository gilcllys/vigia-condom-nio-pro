-- ============================================================
-- SEED: Usuários de teste para validação de permissões
-- Execute no SQL Editor do Supabase (com permissão service_role)
-- ============================================================
--
-- ANTES DE EXECUTAR:
-- 1) Descubra o UUID do condomínio de teste:
--    SELECT id, name FROM nfe_vigia.condos LIMIT 10;
-- 2) Substitua '<CONDO_ID>' abaixo pelo UUID encontrado.
--
-- TABELAS AFETADAS (somente INSERT/UPDATE, sem DDL):
--   • auth.users           → cria usuário com email confirmado
--   • nfe_vigia.users      → cria registro interno (auth_user_id, condo_id, full_name, email, profile)
--   • nfe_vigia.user_condos → vincula usuário ao condomínio com role e is_default
--
-- CONSTRAINTS ASSUMIDAS:
--   • auth.users: UNIQUE(email), PK(id)
--   • nfe_vigia.users: UNIQUE(auth_user_id), PK(id)
--   • nfe_vigia.user_condos: UNIQUE(user_id, condo_id)
--     onde user_id referencia nfe_vigia.users.id (NÃO auth.users.id)
--
-- SUPOSIÇÕES SOBRE auth.users:
--   • Inserção direta com senha bcrypt via crypt/gen_salt
--   • email_confirmed_at preenchido para pular confirmação
--   • instance_id = '00000000-...' (padrão Supabase single-tenant)
--   • raw_app_meta_data marca provider como "email"
--
-- COLUNAS PREENCHIDAS EM auth.users:
--   instance_id, id, aud, role, email, encrypted_password,
--   email_confirmed_at, created_at, updated_at,
--   confirmation_token, raw_app_meta_data, raw_user_meta_data
--
-- COLUNAS PREENCHIDAS EM nfe_vigia.users:
--   auth_user_id, condo_id, full_name, email, profile
--   (profile é preenchido por compatibilidade; a fonte oficial
--    de permissão é nfe_vigia.user_condos.role)
--
-- COLUNAS PREENCHIDAS EM nfe_vigia.user_condos:
--   user_id (= nfe_vigia.users.id), condo_id, role, is_default
--
-- ROLES USADOS (valores reais de nfe_vigia.user_condos.role):
--   ZELADOR, CONSELHO, SINDICO, SUBSINDICO
--
-- Senha de todos: 12345678
-- ============================================================

DO $$
DECLARE
  v_condo_id uuid := '<CONDO_ID>';  -- <<<< SUBSTITUIR AQUI

  v_now timestamptz := now();

  -- Auth IDs (auth.users.id)
  v_zelador_auth_id    uuid;
  v_conselho_auth_id   uuid;
  v_sindico_auth_id    uuid;
  v_subsindico_auth_id uuid;

  -- Internal IDs (nfe_vigia.users.id)
  v_zelador_uid    uuid;
  v_conselho_uid   uuid;
  v_sindico_uid    uuid;
  v_subsindico_uid uuid;

BEGIN

  -- ============================================================
  -- ETAPA 1: Criar/garantir usuários em auth.users
  --
  -- Colunas preenchidas:
  --   instance_id, id, aud, role, email, encrypted_password,
  --   email_confirmed_at, created_at, updated_at,
  --   confirmation_token, raw_app_meta_data, raw_user_meta_data
  --
  -- Senha: crypt('12345678', gen_salt('bf'))
  -- ON CONFLICT (email) DO NOTHING
  -- ============================================================

  -- zelador@teste.com
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    'zelador@teste.com',
    crypt('12345678', gen_salt('bf')),
    v_now, v_now, v_now, '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_zelador_auth_id;

  IF v_zelador_auth_id IS NULL THEN
    SELECT id INTO v_zelador_auth_id FROM auth.users WHERE email = 'zelador@teste.com';
  END IF;

  -- conselheiro@teste.com
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    'conselheiro@teste.com',
    crypt('12345678', gen_salt('bf')),
    v_now, v_now, v_now, '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_conselho_auth_id;

  IF v_conselho_auth_id IS NULL THEN
    SELECT id INTO v_conselho_auth_id FROM auth.users WHERE email = 'conselheiro@teste.com';
  END IF;

  -- sindico@teste.com
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    'sindico@teste.com',
    crypt('12345678', gen_salt('bf')),
    v_now, v_now, v_now, '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_sindico_auth_id;

  IF v_sindico_auth_id IS NULL THEN
    SELECT id INTO v_sindico_auth_id FROM auth.users WHERE email = 'sindico@teste.com';
  END IF;

  -- subsindico@teste.com
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    'subsindico@teste.com',
    crypt('12345678', gen_salt('bf')),
    v_now, v_now, v_now, '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_subsindico_auth_id;

  IF v_subsindico_auth_id IS NULL THEN
    SELECT id INTO v_subsindico_auth_id FROM auth.users WHERE email = 'subsindico@teste.com';
  END IF;

  -- ============================================================
  -- ETAPA 2: Criar/garantir registros em nfe_vigia.users
  --
  -- Colunas preenchidas:
  --   auth_user_id, condo_id, full_name, email, profile
  --
  -- profile é preenchido por compatibilidade, mas a fonte
  -- oficial de permissão é nfe_vigia.user_condos.role
  --
  -- ON CONFLICT (auth_user_id) DO NOTHING
  -- ============================================================

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id, full_name, email, profile)
  VALUES (v_zelador_auth_id, v_condo_id, 'Usuário Zelador', 'zelador@teste.com', 'ZELADOR')
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_zelador_uid;

  IF v_zelador_uid IS NULL THEN
    SELECT id INTO v_zelador_uid FROM nfe_vigia.users WHERE auth_user_id = v_zelador_auth_id;
  END IF;

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id, full_name, email, profile)
  VALUES (v_conselho_auth_id, v_condo_id, 'Usuário Conselho', 'conselheiro@teste.com', 'CONSELHO')
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_conselho_uid;

  IF v_conselho_uid IS NULL THEN
    SELECT id INTO v_conselho_uid FROM nfe_vigia.users WHERE auth_user_id = v_conselho_auth_id;
  END IF;

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id, full_name, email, profile)
  VALUES (v_sindico_auth_id, v_condo_id, 'Usuário Síndico', 'sindico@teste.com', 'SINDICO')
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_sindico_uid;

  IF v_sindico_uid IS NULL THEN
    SELECT id INTO v_sindico_uid FROM nfe_vigia.users WHERE auth_user_id = v_sindico_auth_id;
  END IF;

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id, full_name, email, profile)
  VALUES (v_subsindico_auth_id, v_condo_id, 'Usuário Subsíndico', 'subsindico@teste.com', 'SUBSINDICO')
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_subsindico_uid;

  IF v_subsindico_uid IS NULL THEN
    SELECT id INTO v_subsindico_uid FROM nfe_vigia.users WHERE auth_user_id = v_subsindico_auth_id;
  END IF;

  -- ============================================================
  -- ETAPA 3: Vincular em nfe_vigia.user_condos com role e is_default
  --
  -- Colunas preenchidas:
  --   user_id (= nfe_vigia.users.id), condo_id, role, is_default
  --
  -- IMPORTANTE: user_id referencia nfe_vigia.users.id,
  --             NÃO auth.users.id
  --
  -- ON CONFLICT (user_id, condo_id) DO UPDATE SET role = ..., is_default = true
  -- ============================================================

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_zelador_uid, v_condo_id, 'ZELADOR', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'ZELADOR', is_default = true;

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_conselho_uid, v_condo_id, 'CONSELHO', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'CONSELHO', is_default = true;

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_sindico_uid, v_condo_id, 'SINDICO', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'SINDICO', is_default = true;

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_subsindico_uid, v_condo_id, 'SUBSINDICO', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'SUBSINDICO', is_default = true;

  -- ============================================================
  -- RESUMO
  -- ============================================================
  RAISE NOTICE '✅ Usuários de teste criados com sucesso!';
  RAISE NOTICE '';
  RAISE NOTICE 'zelador@teste.com     → ZELADOR     (auth: %, uid: %)', v_zelador_auth_id, v_zelador_uid;
  RAISE NOTICE 'conselheiro@teste.com → CONSELHO    (auth: %, uid: %)', v_conselho_auth_id, v_conselho_uid;
  RAISE NOTICE 'sindico@teste.com     → SINDICO     (auth: %, uid: %)', v_sindico_auth_id, v_sindico_uid;
  RAISE NOTICE 'subsindico@teste.com  → SUBSINDICO  (auth: %, uid: %)', v_subsindico_auth_id, v_subsindico_uid;
  RAISE NOTICE '';
  RAISE NOTICE 'Condomínio: %', v_condo_id;

END $$;
