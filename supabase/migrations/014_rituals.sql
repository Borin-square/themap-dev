-- Rituals (eventi) delle aziende. Sostituisce il localStorage lato client
-- cosi' la holding puo' vederli aggregati.

CREATE TABLE IF NOT EXISTS rituals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  azienda       TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  tipologia     TEXT NOT NULL,
  titolo        TEXT NOT NULL,
  data          DATE NOT NULL,
  data_fine     DATE,
  ora           TEXT,
  luogo         TEXT,
  confermato    BOOLEAN NOT NULL DEFAULT FALSE,
  partecipanti  TEXT,
  odg           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rituals_azienda_data_idx ON rituals (azienda, data);
CREATE INDEX IF NOT EXISTS rituals_data_idx ON rituals (data);

ALTER TABLE rituals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rituals"
  ON rituals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage rituals"
  ON rituals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
