-- Reference URLs a livello pagina: link esterni citati/da linkare
-- iniettati nel user prompt di build-html come contesto per Claude.
ALTER TABLE pg_pages
  ADD COLUMN IF NOT EXISTS reference_urls TEXT[] NOT NULL DEFAULT '{}';
