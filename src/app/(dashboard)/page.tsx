export default function HomePage() {
  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Home</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {[
          { label: "FATTURATO", value: "--", sub: "In attesa di dati" },
          { label: "EBITDA", value: "--", sub: "In attesa di dati" },
          { label: "TASK ATTIVI", value: "--", sub: "In attesa di dati" },
          { label: "PERSONE", value: "--", sub: "In attesa di dati" },
        ].map((kpi) => (
          <div key={kpi.label} className="cd">
            <div className="lb">{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 6 }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
