"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isAdmin } from "@/lib/auth";
import { fetchHoldingSlugs } from "@/lib/serenissima";

export default function SerenissimaLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    (async () => {
      // Admin/SuperAdmin passano sempre.
      if (isAdmin(session)) {
        if (!cancelled) setChecked(true);
        return;
      }
      // Altrimenti serve accesso ad almeno una company type='holding'.
      const holdings = await fetchHoldingSlugs();
      const userSlugs = session.aziende === "*"
        ? "*"
        : session.aziende.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const hasHolding = userSlugs === "*"
        ? holdings.length > 0
        : holdings.some((h) => userSlugs.includes(h.toLowerCase()));
      if (cancelled) return;
      if (!hasHolding) {
        router.replace("/");
        return;
      }
      setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [session, loading, router]);

  if (loading || !session || !checked) {
    return (
      <div style={{ padding: 40, color: "var(--fg3)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
        Caricamento…
      </div>
    );
  }
  return <>{children}</>;
}
