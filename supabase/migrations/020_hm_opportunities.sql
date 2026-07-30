-- Sistema Valutazione Opportunità Holding.
--
-- Scorecard con 4 categorie × 5 sotto-voci:
--   - leader                 (35 pt): 5 sotto-voci × 0-7
--   - project_quality        (25 pt): 5 sotto-voci × 0-5
--   - serenissima_impact     (25 pt): 5 sotto-voci × 0-5
--   - portfolio_coherence    (15 pt): 5 sotto-voci × 0-3
-- Totale max = 100 pt per socio; score finale opportunità = media dei 3 soci.
--
-- Flusso:
--   in_valutazione → (Rivela voti manuale, quando tutti i soci hanno votato)
--   → rivelata     → (Decidi manuale: no / osservazione / approfondimento)
--   → decisa       → (Archivia)
--   → archiviata
--
-- I "soci" sono 3 utenti Supabase (auth.uid) configurati in hm_opportunity_settings.
-- Solo i soci configurati possono votare; qualunque super-admin può creare,
-- rivelare, decidere, archiviare.

/* ── Opportunità ── */
CREATE TABLE IF NOT EXISTS hm_opportunities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_slug      TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  leader_proponent  TEXT,
  sector            TEXT,
  status            TEXT NOT NULL DEFAULT 'in_valutazione'
                    CHECK (status IN ('in_valutazione','rivelata','decisa','archiviata')),
  revealed_at       TIMESTAMPTZ,
  revealed_by       TEXT,
  decision          TEXT CHECK (decision IN ('no','osservazione','approfondimento')),
  decided_at        TIMESTAMPTZ,
  decided_by        TEXT,
  archived_at       TIMESTAMPTZ,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_opportunities_holding_idx ON hm_opportunities (holding_slug, status);

/* ── Voti dei soci (una riga per socio × sotto-voce × opportunità) ── */
CREATE TABLE IF NOT EXISTS hm_opportunity_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES hm_opportunities(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL, -- auth.uid del socio votante
  category       TEXT NOT NULL
                 CHECK (category IN ('leader','project_quality','serenissima_impact','portfolio_coherence')),
  criterion_key  TEXT NOT NULL, -- es. 'value_alignment', 'market_size', ...
  score          NUMERIC NOT NULL, -- 0..max_score della sotto-voce
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, user_id, criterion_key)
);

CREATE INDEX IF NOT EXISTS hm_opportunity_scores_opp_idx  ON hm_opportunity_scores (opportunity_id);
CREATE INDEX IF NOT EXISTS hm_opportunity_scores_user_idx ON hm_opportunity_scores (opportunity_id, user_id);

/* ── Allegati PDF ── */
CREATE TABLE IF NOT EXISTS hm_opportunity_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES hm_opportunities(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  storage_path   TEXT NOT NULL, -- path dentro bucket "hm-opportunities"
  public_url     TEXT NOT NULL,
  size_bytes     BIGINT,
  uploaded_by    TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_opportunity_attachments_opp_idx ON hm_opportunity_attachments (opportunity_id);

/* ── Impostazioni per holding (soglie + i 3 soci) ── */
CREATE TABLE IF NOT EXISTS hm_opportunity_settings (
  holding_slug         TEXT PRIMARY KEY,
  no_threshold         NUMERIC NOT NULL DEFAULT 60,   -- sotto = suggerimento "No"
  deep_dive_threshold  NUMERIC NOT NULL DEFAULT 75,   -- sopra = "Approfondimento"; tra le due = "Osservazione"
  leader_min           NUMERIC NOT NULL DEFAULT 20,   -- Leader medio sotto = "No" forzato
  partner_user_ids     UUID[] NOT NULL DEFAULT '{}',  -- auth.uid dei 3 soci
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           TEXT
);

/* ── RLS + Realtime ── */
ALTER TABLE hm_opportunities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hm_opportunity_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hm_opportunity_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hm_opportunity_settings     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON hm_opportunities           FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON hm_opportunity_scores      FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON hm_opportunity_attachments FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON hm_opportunity_settings    FOR ALL TO public USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE hm_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE hm_opportunity_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE hm_opportunity_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE hm_opportunity_settings;

ALTER TABLE hm_opportunities            REPLICA IDENTITY FULL;
ALTER TABLE hm_opportunity_scores       REPLICA IDENTITY FULL;
ALTER TABLE hm_opportunity_attachments  REPLICA IDENTITY FULL;
ALTER TABLE hm_opportunity_settings     REPLICA IDENTITY FULL;

/* ── Storage bucket per allegati PDF ──
   NOTA: il bucket "hm-opportunities" va creato via Supabase Studio o API una
   sola volta (Storage → New bucket → Public). Non è creabile da SQL puro. */
