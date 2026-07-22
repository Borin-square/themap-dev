-- Aggiunge 'operative' come terzo tipo azienda (accanto a holding e client).

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_type_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_type_check
  CHECK (type IN ('holding', 'operative', 'client'));
