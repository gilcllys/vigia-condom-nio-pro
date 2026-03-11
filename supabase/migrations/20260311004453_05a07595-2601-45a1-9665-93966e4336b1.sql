
CREATE SCHEMA IF NOT EXISTS nfe_vigia;

CREATE TABLE IF NOT EXISTS nfe_vigia.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condo_id uuid NOT NULL,
  cnpj text,
  company_name text,
  trade_name text NOT NULL,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  service_type text,
  notes text,
  status text NOT NULL DEFAULT 'ativo',
  risk_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nfe_vigia.provider_risk_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES nfe_vigia.providers(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'MEDIO',
  receita_status text,
  recommendation text,
  positive_points jsonb DEFAULT '[]'::jsonb,
  attention_points jsonb DEFAULT '[]'::jsonb,
  summary text,
  full_report text,
  cnpj_data jsonb,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nfe_vigia.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_vigia.provider_risk_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_select" ON nfe_vigia.providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "providers_insert" ON nfe_vigia.providers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "providers_update" ON nfe_vigia.providers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "providers_delete" ON nfe_vigia.providers FOR DELETE TO authenticated USING (true);

CREATE POLICY "risk_select" ON nfe_vigia.provider_risk_analysis FOR SELECT TO authenticated USING (true);
CREATE POLICY "risk_insert" ON nfe_vigia.provider_risk_analysis FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "risk_update" ON nfe_vigia.provider_risk_analysis FOR UPDATE TO authenticated USING (true);
