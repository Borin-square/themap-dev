-- KG Optimizer: persistenza per audit structured-data avanzato (LLM + accept/generate)

CREATE TABLE IF NOT EXISTS kg_audits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug         TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  extracted_blocks     JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_at         TIMESTAMPTZ,
  analysis             JSONB,
  analyzed_at          TIMESTAMPTZ,
  accepted_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_markup         TEXT,
  generated_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_slug, url)
);

CREATE INDEX IF NOT EXISTS kg_audits_company_idx ON kg_audits (company_slug);

ALTER TABLE kg_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read kg_audits"
  ON kg_audits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage kg_audits"
  ON kg_audits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
