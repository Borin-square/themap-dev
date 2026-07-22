-- Aggiunge il tipo azienda: 'client' (default) o 'holding'.
-- L'azienda holding ospita i tool del gruppo "holding-management".
-- Non tocca i dati esistenti: tutte le aziende gia' presenti restano 'client'.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'client';

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_type_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_type_check
  CHECK (type IN ('holding', 'client'));
