"use client";

import { YEAR_MIN, YEAR_MAX } from "@/lib/serenissima";

interface Props {
  year: number;
  onChange: (y: number) => void;
}

export default function YearTimeline({ year, onChange }: Props) {
  const years: number[] = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) years.push(y);
  return (
    <div
      style={{
        position: "absolute", bottom: 16, left: 16,
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px",
        background: "rgba(20,15,10,0.85)",
        border: "1px solid rgba(242,193,78,0.35)",
        borderRadius: 8,
        zIndex: 5,
      }}
      role="tablist"
      aria-label="Selezione anno"
    >
      <button
        aria-label="Play timeline (in arrivo)"
        title="Play (in arrivo)"
        disabled
        style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "transparent", border: "1px solid rgba(242,193,78,0.4)",
          color: "rgba(242,193,78,0.5)", cursor: "not-allowed", fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >▶</button>
      <div style={{ width: 1, height: 20, background: "rgba(242,193,78,0.25)", margin: "0 4px" }} />
      {years.map((y) => {
        const active = y === year;
        return (
          <button
            key={y}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(y)}
            style={{
              padding: "4px 10px", borderRadius: 4,
              background: active ? "#c1443a" : "transparent",
              color: active ? "#fff" : "#f4e8d0",
              border: active ? "1px solid #c1443a" : "1px solid transparent",
              cursor: "pointer",
              fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: 1,
            }}
          >{y}</button>
        );
      })}
    </div>
  );
}
