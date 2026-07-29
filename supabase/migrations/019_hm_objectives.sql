-- Sistema Obiettivi Holding a 3 livelli (Collins-style).
--
-- kind='bhag'   : 1 obiettivo qualitativo di lungo periodo. `target_year` = anno target scelto dall'utente.
-- kind='medium' : 3-5 traguardi intermedi con metrica. `target_year` = orizzonte scelto (2-10 anni).
-- kind='march'  : 5-6 soglie annuali (20 Mile March). `year` = anno del piano annuale (usa YearProvider).
--
-- parent_id realizza la catena march -> medium -> bhag per la vista "connessa".
-- Valori metric_target/metric_current sono manuali per ora (no auto-derive dall'economic-engine).

CREATE TABLE IF NOT EXISTS hm_objectives (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_slug   TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('bhag','medium','march')),
  title          TEXT NOT NULL,
  description    TEXT,
  target_year    INT,   -- per bhag e medium: anno target scelto dall'utente
  year           INT,   -- per march: anno del piano annuale
  metric_name    TEXT,
  metric_target  NUMERIC,
  metric_current NUMERIC,
  metric_unit    TEXT,  -- es. "%", "€", "punti", "M€"
  status         TEXT CHECK (status IN ('hit','ontrack','risk','miss')),
  parent_id      UUID REFERENCES hm_objectives(id) ON DELETE SET NULL,
  order_index    INT NOT NULL DEFAULT 0,
  owner          TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_objectives_holding_idx     ON hm_objectives (holding_slug, kind);
CREATE INDEX IF NOT EXISTS hm_objectives_holding_year    ON hm_objectives (holding_slug, year) WHERE kind = 'march';
CREATE INDEX IF NOT EXISTS hm_objectives_parent_idx      ON hm_objectives (parent_id);

ALTER TABLE hm_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON hm_objectives FOR ALL TO public USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE hm_objectives;
ALTER TABLE hm_objectives REPLICA IDENTITY FULL;
