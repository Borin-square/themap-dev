"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getAllowedSlugs } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const allowed = getAllowedSlugs(session);

  // Operativi: redirect alla prima azienda accessibile
  useEffect(() => {
    if (allowed !== "*" && allowed.length > 0) {
      router.replace(`/${allowed[0]}/flywheel`);
    }
  }, [allowed, router]);

  if (allowed !== "*") return null;

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
