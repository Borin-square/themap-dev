"use client";

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "./supabase";

/**
 * Persisted state hook.
 * Key format: "themap:<company>:<dataType>"
 * Syncs to Supabase (source of truth) with localStorage as cache/fallback.
 *
 * Guarantees:
 * - Initial mock data from `init()` is NEVER persisted unless the user actually modifies the state.
 * - Late hydration from Supabase does NOT overwrite changes the user has already made.
 */
export function useLocalState<T>(key: string, init: () => T, version?: number): [T, Dispatch<SetStateAction<T>>] {
  const vKey = version != null ? `${key}:v${version}` : key;
  const [state, setState] = useState<T>(init);
  const [hydrated, setHydrated] = useState(false);
  const hasRealDataRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parts = vKey.split(":");
  const company = parts[1] || "";
  const dataKey = parts.slice(2).join(":") || parts[0];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("data")
          .eq("company", company)
          .eq("key", dataKey)
          .single();

        if (!error && data && !cancelled) {
          if (!dirtyRef.current) {
            setState(data.data as T);
            try { localStorage.setItem(vKey, JSON.stringify(data.data)); } catch {}
          }
          hasRealDataRef.current = true;
          setHydrated(true);
          return;
        }
      } catch { /* fall through */ }

      if (!cancelled) {
        let loadedFromLocal = false;
        try {
          const stored = localStorage.getItem(vKey);
          if (stored && !dirtyRef.current) {
            setState(JSON.parse(stored));
            loadedFromLocal = true;
          }
        } catch {}
        hasRealDataRef.current = loadedFromLocal;
        setHydrated(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [vKey, company, dataKey]);

  const saveToSupabase = useCallback(
    (value: T) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try { localStorage.setItem(vKey, JSON.stringify(value)); } catch {}
        try {
          await supabase
            .from("app_state")
            .upsert(
              { company, key: dataKey, data: value, updated_at: new Date().toISOString() },
              { onConflict: "company,key" },
            );
        } catch { /* offline — localStorage has the data */ }
      }, 500);
    },
    [vKey, company, dataKey],
  );

  const setStateDirty = useCallback<Dispatch<SetStateAction<T>>>((v) => {
    dirtyRef.current = true;
    setState(v);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasRealDataRef.current && !dirtyRef.current) return;
    saveToSupabase(state);
  }, [state, hydrated, saveToSupabase]);

  return [state, setStateDirty];
}
