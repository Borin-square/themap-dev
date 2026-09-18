"use client";

interface Props {
  view: "world" | "strategic";
  onChange: (v: "world" | "strategic") => void;
  onAdminClick?: () => void;
  showAdmin?: boolean;
}

export default function ViewToggle({ view, onChange, onAdminClick, showAdmin }: Props) {
  return (
    <div
      style={{
        position: "absolute", top: 16, left: 16, zIndex: 5,
        display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start",
      }}
    >
      <div style={{ background: "rgba(20,15,10,0.85)", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(242,193,78,0.35)" }}>
        <div style={{ color: "#f2c14e", fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Serenissima</div>
        <div style={{ color: "#c1443a", fontSize: 9, letterSpacing: 3, textTransform: "uppercase", marginTop: 2 }}>Ecosystem Map</div>
      </div>
      <div style={{ display: "flex", gap: 4, background: "rgba(20,15,10,0.85)", padding: 4, borderRadius: 6, border: "1px solid rgba(242,193,78,0.35)" }}>
        <ToggleBtn active={view === "world"} onClick={() => onChange("world")} label="Mondo" />
        <ToggleBtn active={view === "strategic"} onClick={() => onChange("strategic")} label="Strategica" />
      </div>
      {showAdmin && (
        <button
          onClick={onAdminClick}
          style={{
            background: "rgba(20,15,10,0.85)", border: "1px solid rgba(242,193,78,0.35)",
            padding: "6px 10px", borderRadius: 6, color: "#f4e8d0",
            fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, cursor: "pointer",
          }}
        >Admin →</button>
      )}
    </div>
  );
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 12px", borderRadius: 4, border: "none",
        background: active ? "#c1443a" : "transparent",
        color: active ? "#fff" : "#f4e8d0",
        fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600,
        cursor: "pointer",
      }}
    >{label}</button>
  );
}
