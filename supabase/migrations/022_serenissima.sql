-- Serenissima Ecosystem Map
-- Tre tabelle:
--   serenissima_company_map  → metadata mappa per azienda (posizione, scores, portfolio status)
--   serenissima_snapshots    → override manuali headcount/revenue/ebitda per anno
--                              (fallback: app_state.eeForecast + app_state.people)
--   serenissima_cross_sell   → eventi cross-sell direzionali per anno

------------------------------------------------------------------
-- serenissima_company_map
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS serenissima_company_map (
  company_slug     TEXT PRIMARY KEY REFERENCES companies(slug) ON DELETE CASCADE,
  portfolio_status TEXT NOT NULL DEFAULT 'portfolio'
                   CHECK (portfolio_status IN ('portfolio','evaluating','incubating','exited','archived')),
  position_x       NUMERIC(6,4) NOT NULL DEFAULT 0.5 CHECK (position_x >= 0 AND position_x <= 1),
  position_y       NUMERIC(6,4) NOT NULL DEFAULT 0.5 CHECK (position_y >= 0 AND position_y <= 1),
  expandability_score INT CHECK (expandability_score BETWEEN 1 AND 5),
  confidence_score    INT CHECK (confidence_score    BETWEEN 1 AND 5),
  ownership_pct    NUMERIC(6,3) CHECK (ownership_pct BETWEEN 0 AND 100),
  business_model   TEXT,
  emblem_path      TEXT,
  city_seed        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------------
-- serenissima_snapshots (override manuale per anno)
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS serenissima_snapshots (
  company_slug   TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  year           INT  NOT NULL,
  headcount      INT,
  revenue        NUMERIC(14,2),
  ebitda         NUMERIC(14,2),
  revenue_status TEXT DEFAULT 'unknown'
                 CHECK (revenue_status IN ('revenue','pre_revenue','unknown')),
  maturity_stage TEXT
                 CHECK (maturity_stage IN ('rotta','porto','corporazioni','repubblica','arsenale')),
  data_type      TEXT NOT NULL DEFAULT 'actual'
                 CHECK (data_type IN ('actual','forecast')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_slug, year, data_type)
);

CREATE INDEX IF NOT EXISTS serenissima_snapshots_year_idx
  ON serenissima_snapshots (year);

------------------------------------------------------------------
-- serenissima_cross_sell
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS serenissima_cross_sell (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug          TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  dest_slug            TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  year                 INT  NOT NULL,
  status               TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','won','lost','cancelled')),
  client_reference     TEXT,
  opportunity_reference TEXT,
  external_crm_id      TEXT,
  expected_revenue     NUMERIC(14,2),
  won_revenue          NUMERIC(14,2),
  won_margin           NUMERIC(14,2),
  opened_at            DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at            DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_slug <> dest_slug)
);

CREATE INDEX IF NOT EXISTS serenissima_cross_sell_year_idx
  ON serenissima_cross_sell (year);
CREATE INDEX IF NOT EXISTS serenissima_cross_sell_source_idx
  ON serenissima_cross_sell (source_slug, year);
CREATE INDEX IF NOT EXISTS serenissima_cross_sell_dest_idx
  ON serenissima_cross_sell (dest_slug, year);

------------------------------------------------------------------
-- RLS: authenticated read, service_role write
-- Il gating fine "holding-only" è gestito lato route/API.
------------------------------------------------------------------
ALTER TABLE serenissima_company_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE serenissima_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE serenissima_cross_sell  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read serenissima_company_map"
  ON serenissima_company_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage serenissima_company_map"
  ON serenissima_company_map FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read serenissima_snapshots"
  ON serenissima_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage serenissima_snapshots"
  ON serenissima_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read serenissima_cross_sell"
  ON serenissima_cross_sell FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage serenissima_cross_sell"
  ON serenissima_cross_sell FOR ALL TO service_role USING (true) WITH CHECK (true);
