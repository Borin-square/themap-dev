"use client";

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "./supabase";

/**
 * Persisted state hook.
 * Key format: "themap:<company>:<dataType>"
 *
 * Modello:
 *  - Supabase e' la source of truth. localStorage e' solo cache ottimistica
 *    per evitare flash-vuoto sulla prima paint.
 *  - Realtime: ogni istanza si sottoscrive ai cambi della propria riga
 *    (company, key, year) → editor multipli vedono lo stesso stato senza refresh.
 *  - Visibility refetch: quando la tab torna visibile, ripullo dal server
 *    per raccogliere eventuali cambi persi (o come fallback se realtime e' giu').
 *  - Save fail visibile: ogni errore di scrittura emette un event
 *    "themap:save-status" ascoltato dal <SaveStatusToast/> globale. Niente piu'
 *    fallimenti silenziosi.
 *  - Anti-distruzione: se il server risponde con payload "vuoto" MA il
 *    localStorage locale contiene dati sostanziali, NON sovrascriviamo il locale.
 *    Al contrario, forziamo il rewrite del locale sul server (recupero).
 *    Questo previene lo scenario in cui una precedente write fallita lascia
 *    su Supabase una riga stub {} che poi zappa il localStorage del client.
 *
 * Year:
 *  - Optional. Default 2026 (backfill anno del DB).
 *
 * Ritorno: [state, setState, flush, hydrated]
 *  - flush(): scrittura sincrona immediata (bypassa debounce).
 *  - hydrated: true dopo il primo settle del load.
 */
export function useLocalState<T>(
  key: string,
  init: () => T,
  version?: number,
  year?: number,
): [T, Dispatch<SetStateAction<T>>, () => Promise<void>, boolean] {
  const effectiveYear = year ?? 2026;
  const baseKey = version != null ? `${key}:v${version}` : key;
  const vKey = year != null ? `${baseKey}:y${effectiveYear}` : baseKey;
  const [state, setState] = useState<T>(init);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestState = useRef<T>(state);
  latestState.current = state;
  // Blocca il primo save-effect subito dopo la hydration.
  const skipNextSave = useRef(true);
  // JSON dell'ultimo valore noto come sincronizzato col server. Serve per
  // de-duplicare gli echi realtime dei nostri stessi write.
  const lastServerJson = useRef<string | null>(null);

  const parts = baseKey.split(":");
  const company = parts[1] || "";
  const dataKey = parts.slice(2).join(":") || parts[0];

  const writeToSupabase = useCallback(async (value: T): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("app_state")
        .upsert(
          { company, key: dataKey, year: effectiveYear, data: value, updated_at: new Date().toISOString() },
          { onConflict: "company,key,year" },
        );
      if (error) {
        emitSaveStatus({ vKey, ok: false, error: error.message });
        return false;
      }
      lastServerJson.current = JSON.stringify(value);
      emitSaveStatus({ vKey, ok: true });
      return true;
    } catch (e) {
      emitSaveStatus({ vKey, ok: false, error: (e as Error).message });
      return false;
    }
  }, [company, dataKey, effectiveYear, vKey]);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setState(init());
    skipNextSave.current = true;
    lastServerJson.current = null;

    async function load() {
      // Cache ottimistica: prima paint dal localStorage per evitare flash-vuoto.
      // NON marchiamo ancora hydrated: il server ha priorita' logica.
      let localValue: T | null = null;
      try {
        const stored = localStorage.getItem(vKey);
        if (stored) {
          localValue = JSON.parse(stored) as T;
          if (!cancelled) setState(localValue);
        }
      } catch { /* ignore */ }

      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("data")
          .eq("company", company)
          .eq("key", dataKey)
          .eq("year", effectiveYear)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          emitSaveStatus({ vKey, ok: false, error: `Load: ${error.message}` });
          setHydrated(true);
          return;
        }

        if (data) {
          const serverValue = data.data as T;
          const serverJson = JSON.stringify(serverValue);
          const localJson = localValue != null ? JSON.stringify(localValue) : null;

          // Anti-distruzione: server vuoto + local pieno → mantieni local + rewrite su server.
          if (isEmptyPayload(serverValue) && localValue != null && !isEmptyPayload(localValue) && localJson !== serverJson) {
            // Non tocchiamo state (gia' impostato al valore local). Marchiamo
            // hydrated e forziamo un rewrite senza passare per skipNextSave,
            // cosi' il prossimo save-effect scriverà i dati locali sul server.
            lastServerJson.current = null; // il server non e' allineato
            setHydrated(true);
            // Trigger scrittura di recupero: usa flush-style diretto.
            writeToSupabase(localValue);
            return;
          }

          // Caso normale: server autoritativo.
          if (localJson !== serverJson) {
            setState(serverValue);
          }
          try { localStorage.setItem(vKey, serverJson); } catch { /* ignore */ }
          lastServerJson.current = serverJson;
          setHydrated(true);
          return;
        }

        // Nessuna riga sul server. Se abbiamo un local, useLocalState scrivera'
        // al primo cambio dell'utente. Non forziamo scritture spontanee di init.
        setHydrated(true);
      } catch (e) {
        if (!cancelled) {
          emitSaveStatus({ vKey, ok: false, error: `Load: ${(e as Error).message}` });
          setHydrated(true);
        }
      }
    }

    load();

    // Realtime: propaga cambi da altri client sulla stessa (company, key, year).
    // Il filter Supabase permette una sola clausola: filtriamo per company e
    // ri-filtriamo client-side per key/year.
    const channel = supabase
      .channel(`app_state:${company}:${dataKey}:${effectiveYear}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_state",
          filter: `company=eq.${company}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; year?: number; data?: unknown } | null;
          if (!row || row.key !== dataKey || row.year !== effectiveYear) return;
          if (payload.eventType === "DELETE") return;
          const nextJson = JSON.stringify(row.data);
          if (nextJson === lastServerJson.current) return; // eco del nostro write
          lastServerJson.current = nextJson;
          try { localStorage.setItem(vKey, nextJson); } catch { /* ignore */ }
          skipNextSave.current = true; // evita loop: il cambio arriva dal server
          setState(row.data as T);
        },
      )
      .subscribe();

    // Refetch on visibility: quando torni sulla tab, ripulla lo stato server.
    function onVis() {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        load();
      }
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vKey, company, dataKey, effectiveYear]);

  const scheduleSave = useCallback((value: T) => {
    try { localStorage.setItem(vKey, JSON.stringify(value)); } catch { /* ignore */ }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { writeToSupabase(value); }, 500);
  }, [vKey, writeToSupabase]);

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const value = latestState.current;
    try { localStorage.setItem(vKey, JSON.stringify(value)); } catch { /* ignore */ }
    await writeToSupabase(value);
  }, [vKey, writeToSupabase]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    scheduleSave(state);
  }, [state, hydrated, scheduleSave]);

  // Flush pending writes su hide/close del tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onHide() {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        writeToSupabase(latestState.current);
      }
    }
    window.addEventListener("pagehide", onHide);
    const onVisHide = () => { if (document.visibilityState === "hidden") onHide(); };
    document.addEventListener("visibilitychange", onVisHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisHide);
    };
  }, [writeToSupabase]);

  return [state, setState, flush, hydrated];
}

// ── helpers ──

export type SaveStatusDetail = {
  vKey: string;
  ok: boolean;
  error?: string;
};

function emitSaveStatus(detail: SaveStatusDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SaveStatusDetail>("themap:save-status", { detail }));
}

/**
 * "Vuoto sostanziale": null/undefined, {}, [], oppure il pattern noto
 * {blocks:[]} usato dalla strategy page. Usato per riconoscere righe stub
 * lasciate su Supabase da write fallite passate.
 */
function isEmptyPayload(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== "object") return false;
  if (Array.isArray(v)) return v.length === 0;
  const keys = Object.keys(v as object);
  if (keys.length === 0) return true;
  if (
    keys.length === 1 &&
    keys[0] === "blocks" &&
    Array.isArray((v as { blocks: unknown[] }).blocks) &&
    (v as { blocks: unknown[] }).blocks.length === 0
  ) return true;
  return false;
}
