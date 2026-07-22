-- Presentazioni della tab Vision (holding-management).
-- Ogni riga e' un file PDF caricato sul bucket brand-assets.

CREATE TABLE IF NOT EXISTS hm_presentations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_presentations_company_idx
  ON hm_presentations (company_slug, created_at DESC);

ALTER TABLE hm_presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hm_presentations"
  ON hm_presentations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage hm_presentations"
  ON hm_presentations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
