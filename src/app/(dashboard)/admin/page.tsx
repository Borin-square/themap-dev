"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isSuperAdmin } from "@/lib/auth";
import { FEATURE_DEFS } from "@/lib/features";
import { fetchCompanies, type Company } from "@/lib/companies";
import { supabase } from "@/lib/supabase";

interface FeatureRow {
  company_slug: string;
  feature_key: string;
  enabled: boolean;
}

export default function AdminFeaturesPage() {
  const { session, refreshFeatures } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (session && !isSuperAdmin(session)) {
      router.replace("/");
    }
  }, [session, router]);

  const loadData = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    const [comps, featRes] = await Promise.all([
      fetchCompanies(),
      fetch("/api/features", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ]);

    setCompanies(comps);
    if (Array.isArray(featRes)) setFeatures(featRes);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function isEnabled(companySlug: string, featureKey: string): boolean {
    const row = features.find((f) => f.company_slug === companySlug && f.feature_key === featureKey);
    return row ? row.enabled : true; // default enabled
  }

  async function toggle(companySlug: string, featureKey: string) {
    const current = isEnabled(companySlug, featureKey);
    const newVal = !current;
    const key = `${companySlug}:${featureKey}`;
    setSaving(key);

    // Optimistic update
    setFeatures((prev) => {
      const idx = prev.findIndex((f) => f.company_slug === companySlug && f.feature_key === featureKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], enabled: newVal };
        return next;
      }
      return [...prev, { company_slug: companySlug, feature_key: featureKey, enabled: newVal }];
    });

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await fetch("/api/features", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ company_slug: companySlug, feature_key: featureKey, enabled: newVal }),
      });
      refreshFeatures();
    } catch {
      // Revert on error
      setFeatures((prev) => {
        const idx = prev.findIndex((f) => f.company_slug === companySlug && f.feature_key === featureKey);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], enabled: current };
          return next;
        }
        return prev;
      });
    }
    setSaving(null);
  }

  if (!session || !isSuperAdmin(session)) return null;
  if (loading) return <div style={{ color: "var(--fg3)", fontSize: 13, padding: 24 }}>Caricamento...</div>;

  // Group features by group
  const groups = Array.from(new Set(FEATURE_DEFS.map((f) => f.group)));

  return (
    <div>
      <div className="settings-header">
        <h2>Feature Manager</h2>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 20 }}>
        Abilita o disabilita le tab per ogni azienda. Default: tutto attivo.
      </p>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--bg)", zIndex: 2 }}>Feature</th>
              {companies.map((c) => (
                <th key={c.slug} style={{ textAlign: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, display: "inline-block" }} />
                    {c.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <>
                <tr key={`group-${group}`}>
                  <td
                    colSpan={companies.length + 1}
                    style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--fg3)", paddingTop: 16, borderBottom: "1px solid var(--bd)" }}
                  >
                    {group}
                  </td>
                </tr>
                {FEATURE_DEFS.filter((f) => f.group === group).map((feat) => (
                  <tr key={feat.key}>
                    <td style={{ position: "sticky", left: 0, background: "var(--bg2)", zIndex: 1, fontSize: 13 }}>
                      {feat.label}
                    </td>
                    {companies.map((c) => {
                      const enabled = isEnabled(c.slug, feat.key);
                      const key = `${c.slug}:${feat.key}`;
                      return (
                        <td key={key} style={{ textAlign: "center" }}>
                          <button
                            className="feat-toggle"
                            data-on={enabled}
                            disabled={saving === key}
                            onClick={() => toggle(c.slug, feat.key)}
                            aria-label={`${feat.label} per ${c.name}: ${enabled ? "attivo" : "disattivo"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
