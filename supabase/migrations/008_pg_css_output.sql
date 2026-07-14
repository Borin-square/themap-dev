-- CSS custom della pagina, generato dalla build-html quando lo snippet del tema
-- non copre tutto ciò che serve. Va incollato nel campo "CSS dedicato" di WordPress
-- (stampato inline nella pagina, senza tag <style>).
ALTER TABLE pg_page_versions
  ADD COLUMN IF NOT EXISTS css_output TEXT;
