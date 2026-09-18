-- Serenissima: separazione strategic vs render coordinates + settlement anchors.
--
-- strategic_x/y: posizione strategica (services↔products / B2B↔community). Il valore
--                di business rimane invariato — riflette il posizionamento dell'azienda.
-- render_x/y:    posizione visiva sulla base-map illustrata. Deve cadere su un punto
--                abitabile (isola/costa) dell'illustration. Se null, il renderer usa
--                strategic_x/y come fallback.
--
-- settlement_anchors: punti "abitabili" dell'illustration configurati dall'admin.
-- Un'azienda può essere snappata al nearest anchor libero.

ALTER TABLE serenissima_company_map
  RENAME COLUMN position_x TO strategic_x;

ALTER TABLE serenissima_company_map
  RENAME COLUMN position_y TO strategic_y;

ALTER TABLE serenissima_company_map
  ADD COLUMN IF NOT EXISTS render_x NUMERIC(6,4) CHECK (render_x IS NULL OR (render_x >= 0 AND render_x <= 1)),
  ADD COLUMN IF NOT EXISTS render_y NUMERIC(6,4) CHECK (render_y IS NULL OR (render_y >= 0 AND render_y <= 1)),
  ADD COLUMN IF NOT EXISTS asset_variant TEXT;

------------------------------------------------------------------
-- settlement_anchors
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS serenissima_settlement_anchors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  render_x     NUMERIC(6,4) NOT NULL CHECK (render_x >= 0 AND render_x <= 1),
  render_y     NUMERIC(6,4) NOT NULL CHECK (render_y >= 0 AND render_y <= 1),
  region       TEXT,
  capacity     INT NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE serenissima_settlement_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settlement_anchors"
  ON serenissima_settlement_anchors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage settlement_anchors"
  ON serenissima_settlement_anchors FOR ALL TO service_role USING (true) WITH CHECK (true);
