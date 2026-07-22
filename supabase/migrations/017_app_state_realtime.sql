-- Abilita il broadcast Realtime per app_state.
-- Necessario perche' i client si sottoscrivono ai cambi di company/key/year
-- per vedersi live tra utenti (fix bug: viste stantie e "dati che spariscono").
-- REPLICA IDENTITY FULL: i payload realtime contengono l'intera riga OLD/NEW,
-- indispensabile per filtrare client-side per key/year (il filter di Supabase
-- permette una sola clausola di uguaglianza per subscription).

ALTER PUBLICATION supabase_realtime ADD TABLE app_state;
ALTER TABLE app_state REPLICA IDENTITY FULL;
