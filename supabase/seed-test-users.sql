-- ============================================================
-- SEED: Usuários de teste para validação de permissões
-- Execute no SQL Editor do Supabase (com permissão service_role)
-- ============================================================
-- 
-- IMPORTANTE:
-- 1) Substitua '<CONDO_ID>' pelo UUID do condomínio de teste real.
--    Para descobrir, rode:  SELECT id, name FROM nfe_vigia.condos LIMIT 10;
--
-- 2) Este script cria 4 usuários no Auth com e-mail confirmado,
--    vincula cada um em nfe_vigia.users e nfe_vigia.user_condos.
--
-- 3) Roles utilizados (oficiais do sistema):
--    ZELADOR, CONSELHO_FISCAL, SINDICO, SUB_SINDICO
--
-- 4) Senha de todos: 12345678
-- ============================================================

-- ========== CONFIGURAÇÃO ==========
-- Altere esta variável para o UUID do condomínio de teste:
DO $$
DECLARE
  v_condo_id uuid := '<CONDO_ID>';  -- <<<< SUBSTITUIR AQUI

  -- Variáveis internas
  v_zelador_auth_id uuid;
  v_conselho_auth_id uuid;
  v_sindico_auth_id uuid;
  v_subsindico_auth_id uuid;
  v_zelador_internal_id uuid;
  v_conselho_internal_id uuid;
  v_sindico_internal_id uuid;
  v_subsindico_internal_id uuid;
  v_now timestamptz := now();
BEGIN

  -- ========== 1) Criar usuários no Auth ==========
  -- Usa inserção direta em auth.users com email confirmado
  -- A senha '12345678' é hasheada com crypt (bcrypt)

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

  -- Se já existia, buscar o id
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

  -- ========== 2) Criar registros em nfe_vigia.users ==========
  INSERT INTO nfe_vigia.users (auth_user_id, condo_id)
  VALUES (v_zelador_auth_id, v_condo_id)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_zelador_internal_id;

  IF v_zelador_internal_id IS NULL THEN
    SELECT id INTO v_zelador_internal_id FROM nfe_vigia.users WHERE auth_user_id = v_zelador_auth_id;
  END IF;

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id)
  VALUES (v_conselho_auth_id, v_condo_id)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_conselho_internal_id;

  IF v_conselho_internal_id IS NULL THEN
    SELECT id INTO v_conselho_internal_id FROM nfe_vigia.users WHERE auth_user_id = v_conselho_auth_id;
  END IF;

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id)
  VALUES (v_sindico_auth_id, v_condo_id)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_sindico_internal_id;

  IF v_sindico_internal_id IS NULL THEN
    SELECT id INTO v_sindico_internal_id FROM nfe_vigia.users WHERE auth_user_id = v_sindico_auth_id;
  END IF;

  INSERT INTO nfe_vigia.users (auth_user_id, condo_id)
  VALUES (v_subsindico_auth_id, v_condo_id)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_subsindico_internal_id;

  IF v_subsindico_internal_id IS NULL THEN
    SELECT id INTO v_subsindico_internal_id FROM nfe_vigia.users WHERE auth_user_id = v_subsindico_auth_id;
  END IF;

  -- ========== 3) Vincular em nfe_vigia.user_condos ==========
  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_zelador_auth_id, v_condo_id, 'ZELADOR', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'ZELADOR', is_default = true;

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_conselho_auth_id, v_condo_id, 'CONSELHO_FISCAL', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'CONSELHO_FISCAL', is_default = true;

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_sindico_auth_id, v_condo_id, 'SINDICO', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'SINDICO', is_default = true;

  INSERT INTO nfe_vigia.user_condos (user_id, condo_id, role, is_default)
  VALUES (v_subsindico_auth_id, v_condo_id, 'SUB_SINDICO', true)
  ON CONFLICT (user_id, condo_id) DO UPDATE SET role = 'SUB_SINDICO', is_default = true;

  -- ========== Resumo ==========
  RAISE NOTICE '✅ Usuários de teste criados com sucesso!';
  RAISE NOTICE 'zelador@teste.com     → ZELADOR        (auth: %)', v_zelador_auth_id;
  RAISE NOTICE 'conselheiro@teste.com → CONSELHO_FISCAL (auth: %)', v_conselho_auth_id;
  RAISE NOTICE 'sindico@teste.com     → SINDICO         (auth: %)', v_sindico_auth_id;
  RAISE NOTICE 'subsindico@teste.com  → SUB_SINDICO     (auth: %)', v_subsindico_auth_id;
  RAISE NOTICE 'Condomínio: %', v_condo_id;

END $$;
