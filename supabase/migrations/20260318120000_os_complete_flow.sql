-- Create nfe_vigia.approvals table (used for OS approval workflow)
CREATE TABLE IF NOT EXISTS nfe_vigia.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL,
  condo_id uuid NOT NULL,
  approver_id uuid NOT NULL,
  approver_role text NOT NULL,
  approval_type text NOT NULL,
  decision text NOT NULL DEFAULT 'pendente',
  justification text,
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  is_minerva boolean NOT NULL DEFAULT false,
  minerva_justification text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nfe_vigia.approvals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'approvals' AND schemaname = 'nfe_vigia' AND policyname = 'approvals_all') THEN
    CREATE POLICY "approvals_all" ON nfe_vigia.approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add observation column to service_order_photos
ALTER TABLE nfe_vigia.service_order_photos ADD COLUMN IF NOT EXISTS observation text;

-- Add executor_type and final_pdf_url to service_orders
ALTER TABLE nfe_vigia.service_orders ADD COLUMN IF NOT EXISTS executor_type text;
ALTER TABLE nfe_vigia.service_orders ADD COLUMN IF NOT EXISTS final_pdf_url text;
