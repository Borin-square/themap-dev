-- Sistema Scan asincrono + Schedule ricorrenti per il GEO Prompt Monitor.
--
-- Flusso:
--   1) enqueue → INSERT geo_scan_jobs status='queued'
--   2) worker (Vercel cron ogni 1m + fire-and-forget da enqueue) prende il
--      primo 'queued' con FOR UPDATE SKIP LOCKED, esegue lo scan, salva
--      result_scan e passa a 'done' (o 'failed' se errore).
--   3) client (realtime) riceve done → applica result_scan al GEOProject.
--   4) scheduler (Vercel cron ogni 5m) legge geo_scan_schedules con
--      next_run_at <= now() ed enqueua job source='scheduled'.

/* ── Coda + storico dei job scan ── */
CREATE TABLE IF NOT EXISTS geo_scan_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company        TEXT NOT NULL,
  prompt_id      TEXT NOT NULL,         -- id dentro GEOProject.prompts[*]
  prompt_text    TEXT NOT NULL,         -- snapshot (il prompt potrebbe cambiare)
  llm            TEXT NOT NULL,
  brand_name     TEXT NOT NULL,
  competitors    TEXT[] NOT NULL DEFAULT '{}',
  site_url       TEXT,
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','done','failed')),
  source         TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual','scheduled')),
  schedule_id    UUID,                  -- FK aggiunta dopo la tabella schedules
  queued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  error          TEXT,
  result_scan    JSONB,                 -- GEOScan risultante
  created_by     TEXT
);

CREATE INDEX IF NOT EXISTS geo_scan_jobs_company_idx      ON geo_scan_jobs (company);
CREATE INDEX IF NOT EXISTS geo_scan_jobs_status_queued_idx ON geo_scan_jobs (status, queued_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS geo_scan_jobs_prompt_llm_idx    ON geo_scan_jobs (company, prompt_id, llm, completed_at DESC);

/* ── Schedule ricorrenti ── */
CREATE TABLE IF NOT EXISTS geo_scan_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company        TEXT NOT NULL,
  prompt_id      TEXT NOT NULL,
  llm            TEXT NOT NULL,
  cadence        TEXT NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
  dow            INT CHECK (dow IS NULL OR dow BETWEEN 0 AND 6),      -- 0=Dom (per weekly)
  day_of_month   INT CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28), -- per monthly (max 28 = sicuro tutti i mesi)
  hour           INT NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
  minute         INT NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  enabled        BOOLEAN NOT NULL DEFAULT true,
  next_run_at    TIMESTAMPTZ NOT NULL,
  last_run_at    TIMESTAMPTZ,
  last_job_id    UUID,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_scan_schedules_company_prompt_idx ON geo_scan_schedules (company, prompt_id);
CREATE INDEX IF NOT EXISTS geo_scan_schedules_next_run_idx ON geo_scan_schedules (next_run_at) WHERE enabled = true;

-- FK dopo aver creato la tabella per evitare ordering issues
ALTER TABLE geo_scan_jobs
  ADD CONSTRAINT geo_scan_jobs_schedule_fk
  FOREIGN KEY (schedule_id) REFERENCES geo_scan_schedules(id) ON DELETE SET NULL;

/* ── RLS + Realtime ── */
ALTER TABLE geo_scan_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_scan_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON geo_scan_jobs      FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON geo_scan_schedules FOR ALL TO public USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE geo_scan_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE geo_scan_schedules;
ALTER TABLE geo_scan_jobs      REPLICA IDENTITY FULL;
ALTER TABLE geo_scan_schedules REPLICA IDENTITY FULL;
