"use client";

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "./supabase";

/**
 * Persisted state hook.
 * Key format: "themap:<company>:<dataType>"
 * Syncs to Supabase (source of truth) with localStorage as cache/fallback.
 */
export function useLocalState<T>(key: string, init: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(init);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse key → company + dataKey
  const parts = key.split(":");
  const company = parts[1] || "";
  const dataKey = parts.slice(2).join(":") || parts[0];

  // Load: try Supabase first, fall back to localStorage
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try Supabase
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("data")
          .eq("company", company)
          .eq("key", dataKey)
          .single();

        if (!error && data && !cancelled) {
          setState(data.data as T);
          // Update localStorage cache
          try { localStorage.setItem(key, JSON.stringify(data.data)); } catch {}
          setHydrated(true);
          return;
        }
      } catch { /* Supabase unreachable, fall through */ }

      // Fallback: localStorage
      if (!cancelled) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) setState(JSON.parse(stored));
        } catch {}
        setHydrated(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [key, company, dataKey]);

  // Save: debounced write to both Supabase and localStorage
  const saveToSupabase = useCallback(
    (value: T) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        // localStorage (immediate cache)
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}

        // Supabase (upsert)
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
    [key, company, dataKey],
  );

  // Trigger save after hydration
  useEffect(() => {
    if (!hydrated) return;
    saveToSupabase(state);
  }, [state, hydrated, saveToSupabase]);

  return [state, setState];
}
