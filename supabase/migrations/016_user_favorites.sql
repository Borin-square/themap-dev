-- Preferiti utente (bookmark di pagine dell'app).

CREATE TABLE IF NOT EXISTS user_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  href        TEXT NOT NULL,
  label       TEXT NOT NULL,
  sub         TEXT,
  accent      TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, href)
);

CREATE INDEX IF NOT EXISTS user_favorites_user_idx ON user_favorites (user_id, added_at DESC);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own favorites"
  ON user_favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
  ON user_favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON user_favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage user_favorites"
  ON user_favorites FOR ALL TO service_role
  USING (true) WITH CHECK (true);
