-- Aggiunge la dimensione ANNO ai dati di app_state.
-- La colonna year e' NOT NULL DEFAULT 2026: tutte le righe esistenti diventano 2026.
-- La primary key diventa (company, key, year) — cosi' possiamo tenere versioni diverse per anno diverso.

ALTER TABLE app_state
  ADD COLUMN IF NOT EXISTS year INT NOT NULL DEFAULT 2026;

-- Sostituzione della PK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.app_state'::regclass AND contype = 'p'
  ) THEN
    EXECUTE (
      SELECT format('ALTER TABLE app_state DROP CONSTRAINT %I',
                    conname)
      FROM pg_constraint
      WHERE conrelid = 'public.app_state'::regclass AND contype = 'p'
      LIMIT 1
    );
  END IF;
END$$;

ALTER TABLE app_state
  ADD CONSTRAINT app_state_pkey PRIMARY KEY (company, key, year);

CREATE INDEX IF NOT EXISTS app_state_company_year_idx ON app_state (company, year);
