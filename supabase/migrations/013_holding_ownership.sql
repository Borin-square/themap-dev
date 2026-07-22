-- Quote di proprieta' della holding sulle aziende operative.
-- Ogni riga e' una quota valida da una certa data in poi (storico date-based).
-- Per la data D si applica la row con valid_from piu' recente <= D.

CREATE TABLE IF NOT EXISTS holding_ownership (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_slug   TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  operative_slug TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  percent        NUMERIC(6,3) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (holding_slug, operative_slug, valid_from)
);

CREATE INDEX IF NOT EXISTS holding_ownership_lookup_idx
  ON holding_ownership (holding_slug, operative_slug, valid_from DESC);

ALTER TABLE holding_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read holding_ownership"
  ON holding_ownership FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage holding_ownership"
  ON holding_ownership FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
