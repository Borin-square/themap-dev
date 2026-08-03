-- Strategie di sviluppo delle operative (tab "Strategie sviluppo" in
-- holding-management). Ogni riga e' un PDF caricato per una specifica
-- operativa (operative_slug). Il file vive sul bucket brand-assets.

CREATE TABLE IF NOT EXISTS hm_strategies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_slug   TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  operative_slug TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  file_url       TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_strategies_holding_idx
  ON hm_strategies (holding_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS hm_strategies_operative_idx
  ON hm_strategies (operative_slug, created_at DESC);

ALTER TABLE hm_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hm_strategies"
  ON hm_strategies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage hm_strategies"
  ON hm_strategies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
