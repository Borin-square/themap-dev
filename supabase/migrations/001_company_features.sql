-- Feature flags per company
-- Default: se non c'e' riga, la feature e' ATTIVA
-- Inserire riga con enabled=false per disabilitare

CREATE TABLE IF NOT EXISTS company_features (
  company_slug TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  feature_key  TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (company_slug, feature_key)
);

-- Permetti lettura a tutti gli utenti autenticati (serve per sidebar)
ALTER TABLE company_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read company_features"
  ON company_features FOR SELECT
  TO authenticated
  USING (true);

-- Solo service role puo' scrivere (le API usano service client)
CREATE POLICY "Service role can manage company_features"
  ON company_features FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Aggiorna CHECK constraint su user_profiles.ruolo per includere SUPER_ADMIN
-- (gia' eseguito: DROP + ADD con ARRAY['SUPER_ADMIN','ADMIN','OPERATIVO'])
