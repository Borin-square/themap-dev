-- KG Optimizer: aggiungi supporto a override del proposedValue e skipped suggestions

ALTER TABLE kg_audits
  ADD COLUMN IF NOT EXISTS suggestion_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skipped_suggestions  JSONB NOT NULL DEFAULT '[]'::jsonb;
