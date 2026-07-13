-- Page Generator: strumento marketing per generare pagine SEO (pillar/cluster)
-- Ogni company ha N progetti; ogni progetto ha impostazioni (design WP, tone, url autori/casi),
-- una libreria autori/casi studio e N pagine, ciascuna con versioni e media.

/* ─────────────────────────────  PROGETTI  ───────────────────────────── */

CREATE TABLE IF NOT EXISTS pg_projects (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug           TEXT NOT NULL REFERENCES companies(slug) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  wp_design_snippet      TEXT NOT NULL DEFAULT '',
  wp_design_notes        TEXT NOT NULL DEFAULT '',
  tone_of_voice          TEXT NOT NULL DEFAULT '',
  authors_page_url       TEXT,
  case_studies_page_url  TEXT,
  drive_folder_url       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pg_projects_company_idx ON pg_projects (company_slug);

/* ─────────────────────────────  AUTORI  ───────────────────────────── */

CREATE TABLE IF NOT EXISTS pg_authors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES pg_projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  bio          TEXT NOT NULL DEFAULT '',
  photo_url    TEXT,
  linkedin_url TEXT,
  same_as      JSONB NOT NULL DEFAULT '[]'::jsonb, -- array di URL (schema.org sameAs)
  source_url   TEXT,                                -- URL da cui è stato scrapato
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pg_authors_project_idx ON pg_authors (project_id);

/* ─────────────────────────────  CASI STUDIO  ───────────────────────────── */

CREATE TABLE IF NOT EXISTS pg_case_studies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES pg_projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  client       TEXT NOT NULL DEFAULT '',
  sector       TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  results      TEXT NOT NULL DEFAULT '',            -- risultati chiave (testo o JSON stringificato)
  url          TEXT,
  source_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pg_case_studies_project_idx ON pg_case_studies (project_id);

/* ─────────────────────────────  PAGINE  ───────────────────────────── */

CREATE TABLE IF NOT EXISTS pg_pages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES pg_projects(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL DEFAULT '',
  slug                  TEXT,
  page_type             TEXT NOT NULL CHECK (page_type IN ('pillar','cluster')),
  parent_pillar_id      UUID REFERENCES pg_pages(id) ON DELETE SET NULL,
  kw_main               TEXT NOT NULL DEFAULT '',
  kw_secondary          JSONB NOT NULL DEFAULT '[]'::jsonb,
  search_intent         TEXT,
  info_gain_text        TEXT NOT NULL DEFAULT '',
  source_doc_url        TEXT,                        -- doc caricato da cui estrarre info gain
  source_doc_extracted  TEXT,                        -- testo estratto/parsato dal doc
  author_ids            JSONB NOT NULL DEFAULT '[]'::jsonb,
  case_study_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_description      TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','in_review','ready','exported')),
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pg_pages_project_idx        ON pg_pages (project_id);
CREATE INDEX IF NOT EXISTS pg_pages_parent_pillar_idx  ON pg_pages (parent_pillar_id);

/* ───────────────────────  VERSIONI DELLA PAGINA  ────────────────────── */

CREATE TABLE IF NOT EXISTS pg_page_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES pg_pages(id) ON DELETE CASCADE,
  version_no    INTEGER NOT NULL,
  draft_text    TEXT,                                -- bozza testuale (topical authority)
  sections      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id,title,body,order}]
  html_output   TEXT,                                -- HTML finale WordPress
  kg_json       JSONB,                               -- Knowledge Graph strutturato
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version_no)
);

CREATE INDEX IF NOT EXISTS pg_page_versions_page_idx ON pg_page_versions (page_id);

/* ─────────────────────────────  MEDIA  ───────────────────────────── */

CREATE TABLE IF NOT EXISTS pg_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id      UUID NOT NULL REFERENCES pg_pages(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,                        -- link Drive pubblico o storage upload
  media_type   TEXT NOT NULL DEFAULT 'image'
                 CHECK (media_type IN ('image','video','embed','file')),
  alt_text     TEXT NOT NULL DEFAULT '',
  caption      TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pg_media_page_idx ON pg_media (page_id);

/* ─────────────────────────────  RLS  ───────────────────────────── */

ALTER TABLE pg_projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_authors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_case_studies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_media         ENABLE ROW LEVEL SECURITY;

-- Lettura per tutti gli autenticati
CREATE POLICY "Authenticated read pg_projects"      ON pg_projects      FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read pg_authors"       ON pg_authors       FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read pg_case_studies"  ON pg_case_studies  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read pg_pages"         ON pg_pages         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read pg_page_versions" ON pg_page_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read pg_media"         ON pg_media         FOR SELECT TO authenticated USING (true);

-- Scrittura solo service role (le API usano service client)
CREATE POLICY "Service manage pg_projects"      ON pg_projects      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manage pg_authors"       ON pg_authors       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manage pg_case_studies"  ON pg_case_studies  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manage pg_pages"         ON pg_pages         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manage pg_page_versions" ON pg_page_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service manage pg_media"         ON pg_media         FOR ALL TO service_role USING (true) WITH CHECK (true);

/* ─────────────  trigger updated_at su tabelle mutabili  ───────────── */

CREATE OR REPLACE FUNCTION pg_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pg_projects_touch      BEFORE UPDATE ON pg_projects
  FOR EACH ROW EXECUTE FUNCTION pg_touch_updated_at();
CREATE TRIGGER pg_authors_touch       BEFORE UPDATE ON pg_authors
  FOR EACH ROW EXECUTE FUNCTION pg_touch_updated_at();
CREATE TRIGGER pg_case_studies_touch  BEFORE UPDATE ON pg_case_studies
  FOR EACH ROW EXECUTE FUNCTION pg_touch_updated_at();
CREATE TRIGGER pg_pages_touch         BEFORE UPDATE ON pg_pages
  FOR EACH ROW EXECUTE FUNCTION pg_touch_updated_at();
