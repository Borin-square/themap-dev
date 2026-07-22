-- Snapshot dati marketing fetchati via Markifact (o altre pipeline).
-- Contengono i dati reali che il Report deve mostrare invece dei mock.

CREATE TABLE IF NOT EXISTS marketing_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug  TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  range_key     TEXT NOT NULL,   -- es. 'u7', 'u30', 'mese', 'mese_prec', 'ytd', 'm5' ...
  data          JSONB NOT NULL,  -- payload con KPI, breakdowns, trend
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_slug, range_key)
);

CREATE INDEX IF NOT EXISTS marketing_snapshots_lookup ON marketing_snapshots (company_slug, range_key);

ALTER TABLE marketing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read marketing_snapshots"
  ON marketing_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage marketing_snapshots"
  ON marketing_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Richieste di sync pendenti. Un tasto "Refresh" nella UI scrive qui.
-- Claude Code (o un cron) processa le richieste in stato 'pending'.
CREATE TABLE IF NOT EXISTS marketing_sync_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug  TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  range_keys    TEXT[] NOT NULL,  -- i range da rifreshare
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  error         TEXT,
  requested_by  TEXT,             -- email utente
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS marketing_sync_requests_status ON marketing_sync_requests (status, requested_at);
CREATE INDEX IF NOT EXISTS marketing_sync_requests_company ON marketing_sync_requests (company_slug, requested_at DESC);

ALTER TABLE marketing_sync_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read marketing_sync_requests"
  ON marketing_sync_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert marketing_sync_requests"
  ON marketing_sync_requests FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role can manage marketing_sync_requests"
  ON marketing_sync_requests FOR ALL TO service_role
  USING (true) WITH CHECK (true);
