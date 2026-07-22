"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { emptyMktgConfig, type MktgConfig } from "@/lib/marketing-config";

interface BrandLogo {
  id: string;
  name?: string;
  url: string;
}

export default function ImpostazioniPage() {
  const params = useParams();
  const slug = params.company as string;
  const [config, setConfig] = useState<MktgConfig>(emptyMktgConfig());
  const [brandLogos, setBrandLogos] = useState<BrandLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      // Config
      const res = await fetch(`/api/marketing/config?company=${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (res.ok) {
        const j = await res.json();
        if (j.config) setConfig({ ...emptyMktgConfig(), ...j.config, accounts: { ...emptyMktgConfig().accounts, ...(j.config.accounts || {}) }, logo: { ...emptyMktgConfig().logo, ...(j.config.logo || {}) } });
      }
      // Brand logos già presenti (da app_state key='brand')
      try {
        const { data: bd } = await supabase.from("app_state").select("data").eq("company", slug).eq("key", "brand").maybeSingle();
        if (!cancelled && bd?.data && Array.isArray((bd.data as { logos?: unknown }).logos)) {
          const logos = ((bd.data as { logos: unknown[] }).logos as BrandLogo[]).filter((l) => l && typeof l.url === "string");
          setBrandLogos(logos);
        }
      } catch {}
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  function updateAccount(key: keyof MktgConfig["accounts"], value: string) {
    setConfig((c) => ({ ...c, accounts: { ...c.accounts, [key]: value } }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const res = await fetch(`/api/marketing/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company: slug, config }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ text: j.error || "Errore salvataggio", ok: false });
      return;
    }
    setMsg({ text: "Salvato", ok: true });
    setTimeout(() => setMsg(null), 2500);
  }

  async function uploadLogo() {
    if (!uploadFile) return;
    setSaving(true);
    try {
      const filename = `report-logo-${slug}-${Date.now()}-${uploadFile.name}`;
      const { error } = await supabase.storage.from("brand-assets").upload(filename, uploadFile, { upsert: true });
      if (error) { setMsg({ text: "Errore upload: " + error.message, ok: false }); setSaving(false); return; }
      const { data } = supabase.storage.from("brand-assets").getPublicUrl(filename);
      setConfig((c) => ({ ...c, logo: { kind: "upload", ref: data.publicUrl } }));
      setUploadFile(null);
      setMsg({ text: "Logo caricato — ricorda di salvare", ok: true });
    } catch (e) {
      setMsg({ text: "Errore upload: " + (e as Error).message, ok: false });
    }
    setSaving(false);
  }

  if (loading) return <div style={{ color: "var(--fg3)", padding: 30 }}>Caricamento…</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 6 }}>Campaign Manager · Impostazioni</h1>
      <p style={{ fontSize: 13, color: "var(--fg3)", marginTop: 0, marginBottom: 24 }}>
        Configura tipo sito, ID account e logo. Questi dati alimentano il Report.
      </p>

      {/* Tipo sito */}
      <Section title="Tipo sito">
        <div style={{ display: "flex", gap: 12 }}>
          {(["vetrina", "ecommerce"] as const).map((t) => {
            const active = config.siteType === t;
            return (
              <button
                key={t}
                onClick={() => setConfig((c) => ({ ...c, siteType: t }))}
                style={{
                  flex: 1,
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: `1px solid ${active ? "var(--fg)" : "var(--bd)"}`,
                  background: active ? "rgba(255,255,255,0.06)" : "transparent",
                  color: "var(--fg)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{t === "vetrina" ? "Sito vetrina" : "E-commerce"}</div>
                <div style={{ fontSize: 11, color: "var(--fg3)" }}>
                  {t === "vetrina" ? "Report lead generation, contatti sito + campagne" : "Report performance con Entrate, AOV, ROAS, funnel"}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ID Piattaforme */}
      <Section title="ID Piattaforme">
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="GA4 Property ID" placeholder="es. 353123416" value={config.accounts.ga4PropertyId} onChange={(v) => updateAccount("ga4PropertyId", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Google Ads Value (account)" placeholder="es. 1377126766" value={config.accounts.googleAdsValue} onChange={(v) => updateAccount("googleAdsValue", v)} />
            <Field label="Google Ads Manager ID (MCC)" placeholder="es. 9770883645" value={config.accounts.googleAdsManagerId} onChange={(v) => updateAccount("googleAdsManagerId", v)} />
          </div>
          <Field label="Meta Account ID" placeholder="act_1388918781345836" value={config.accounts.metaAccountId} onChange={(v) => updateAccount("metaAccountId", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="TikTok Account ID" placeholder="opzionale" value={config.accounts.tiktokAccountId} onChange={(v) => updateAccount("tiktokAccountId", v)} />
            <Field label="LinkedIn Account ID" placeholder="opzionale" value={config.accounts.linkedinAccountId} onChange={(v) => updateAccount("linkedinAccountId", v)} />
          </div>
        </div>
      </Section>

      {/* Logo */}
      <Section title="Logo per il Report">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {brandLogos.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Da Brand Asset</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {brandLogos.map((l) => {
                  const active = config.logo.kind === "brand" && config.logo.ref === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setConfig((c) => ({ ...c, logo: { kind: "brand", ref: l.id } }))}
                      style={{
                        padding: 8,
                        border: `2px solid ${active ? "var(--fg)" : "var(--bd)"}`,
                        borderRadius: 8,
                        background: "#1E3A8A",
                        cursor: "pointer",
                        width: 140,
                        height: 80,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.url} alt={l.name || l.id} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Oppure carica</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                style={{ fontSize: 12, color: "var(--fg2)" }}
              />
              <button
                onClick={uploadLogo}
                disabled={!uploadFile || saving}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid var(--bd)",
                  background: uploadFile ? "var(--fg)" : "transparent",
                  color: uploadFile ? "var(--bg)" : "var(--fg3)",
                  cursor: uploadFile ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Carica
              </button>
              {config.logo.kind === "upload" && config.logo.ref && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, background: "#1E3A8A", borderRadius: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={config.logo.ref} alt="logo" style={{ height: 30, maxWidth: 140, objectFit: "contain" }} />
                  <span style={{ fontSize: 10, color: "#c9b877" }}>selezionato</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>Fallback</div>
            <button
              onClick={() => setConfig((c) => ({ ...c, logo: { kind: "text", ref: "" } }))}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${config.logo.kind === "text" ? "var(--fg)" : "var(--bd)"}`,
                background: config.logo.kind === "text" ? "rgba(255,255,255,0.06)" : "transparent",
                color: "var(--fg2)",
                cursor: "pointer",
              }}
            >
              Usa nome azienda come testo
            </button>
            <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 6 }}>
              Se nessun logo è selezionato: se un logo Square è disponibile viene usato lui, altrimenti il nome azienda in testo.
            </div>
          </div>
        </div>
      </Section>

      {/* Note */}
      <Section title="Note">
        <textarea
          value={config.notes}
          onChange={(e) => setConfig((c) => ({ ...c, notes: e.target.value }))}
          placeholder="Note libere sulla configurazione (es. periodo di attivazione tracking, eventi custom, ecc.)"
          style={{
            width: "100%",
            minHeight: 80,
            padding: 10,
            borderRadius: 6,
            border: "1px solid var(--bd)",
            background: "transparent",
            color: "var(--fg)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 6,
            border: "1px solid var(--fg)",
            background: "var(--fg)",
            color: "var(--bg)",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Salvataggio…" : "Salva impostazioni"}
        </button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? "#22c55e" : "#ef4444" }}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--fg3)", marginBottom: 12, marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "var(--fg2)", marginBottom: 4 }}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid var(--bd)",
          background: "transparent",
          color: "var(--fg)",
          fontSize: 13,
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}
