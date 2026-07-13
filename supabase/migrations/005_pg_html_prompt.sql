-- Aggiunge il prompt custom per la generazione dell'HTML a livello progetto.
-- Se compilato, viene iniettato nel system prompt come blocco aggiuntivo
-- alle regole di aderenza esistenti (non le sostituisce).
ALTER TABLE pg_projects
  ADD COLUMN IF NOT EXISTS wp_html_prompt TEXT NOT NULL DEFAULT '';
