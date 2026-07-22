"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const YEAR_MIN = 2024;
export const YEAR_MAX = 2029;
export const YEARS: number[] = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

function defaultYear(): number {
  const now = new Date().getFullYear();
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, now));
}

interface YearCtx {
  year: number;
  setYear: (y: number) => void;
}

const YearContext = createContext<YearCtx>({ year: defaultYear(), setYear: () => {} });

const STORAGE_KEY = "themap:year";

export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState<number>(defaultYear);

  // Hydrate from localStorage on client (kept as-is on SSR to avoid mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= YEAR_MIN && n <= YEAR_MAX) setYearState(n);
      }
    } catch { /* ignore */ }
  }, []);

  function setYear(y: number) {
    const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, y));
    setYearState(clamped);
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch { /* ignore */ }
  }

  return <YearContext.Provider value={{ year, setYear }}>{children}</YearContext.Provider>;
}

export function useYear(): YearCtx {
  return useContext(YearContext);
}
