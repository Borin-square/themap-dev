-- Configurazione LLM per la build HTML a livello progetto.
-- html_model: nome del modello Anthropic (default Opus 4.7).
-- html_thinking: se true, attiva extended thinking (temperature forzata a 1 dall'API);
--                se false, uso temperature 0 per massima determinismo.
ALTER TABLE pg_projects
  ADD COLUMN IF NOT EXISTS html_model TEXT NOT NULL DEFAULT 'claude-opus-4-7',
  ADD COLUMN IF NOT EXISTS html_thinking BOOLEAN NOT NULL DEFAULT true;
