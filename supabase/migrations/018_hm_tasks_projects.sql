-- Task Manager sotto Holding Management.
--
-- Due tabelle: hm_projects (container opzionale) e hm_tasks (unita' atomiche).
-- Una task puo' vivere standalone (project_id NULL) o dentro un progetto.
-- Assignee = nome persona (Persona non ha ancora id univoco in DB).
-- Goal = riferimento opzionale a un flywheel goal dell'operativa+anno,
--        oppure testo libero per goal non ancora modellati.

CREATE TABLE IF NOT EXISTS hm_projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_slug   TEXT NOT NULL,
  operative_slug TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  deadline       DATE,
  status         TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','blocked')),
  -- Goal linkabile a fwData: { fn, goal, sub? } oppure { text } per goal libero.
  goal_ref       JSONB,
  year           INT NOT NULL DEFAULT 2026,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_projects_holding_idx    ON hm_projects (holding_slug, year);
CREATE INDEX IF NOT EXISTS hm_projects_operative_idx  ON hm_projects (operative_slug, year);

CREATE TABLE IF NOT EXISTS hm_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_slug   TEXT NOT NULL,
  operative_slug TEXT NOT NULL,
  project_id     UUID REFERENCES hm_projects(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  assignee_name  TEXT,
  deadline       DATE,
  status         TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','blocked')),
  priority       TEXT NOT NULL DEFAULT 'med'  CHECK (priority IN ('low','med','high')),
  goal_ref       JSONB,
  year           INT NOT NULL DEFAULT 2026,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hm_tasks_holding_idx    ON hm_tasks (holding_slug, year);
CREATE INDEX IF NOT EXISTS hm_tasks_operative_idx  ON hm_tasks (operative_slug, year);
CREATE INDEX IF NOT EXISTS hm_tasks_project_idx    ON hm_tasks (project_id);
CREATE INDEX IF NOT EXISTS hm_tasks_assignee_idx   ON hm_tasks (assignee_name);
CREATE INDEX IF NOT EXISTS hm_tasks_deadline_idx   ON hm_tasks (deadline);

-- RLS: coerente con app_state (policy allow_all).
-- Gli endpoint API girano con service role e fanno l'auth check; il client
-- (per il realtime subscribe) deve poter leggere.
ALTER TABLE hm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE hm_tasks    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON hm_projects FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON hm_tasks    FOR ALL TO public USING (true) WITH CHECK (true);

-- Realtime: le due tabelle nella publication + REPLICA IDENTITY FULL
-- per ricevere payload completi (necessario per filtering client-side).
ALTER PUBLICATION supabase_realtime ADD TABLE hm_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE hm_tasks;
ALTER TABLE hm_projects REPLICA IDENTITY FULL;
ALTER TABLE hm_tasks    REPLICA IDENTITY FULL;
