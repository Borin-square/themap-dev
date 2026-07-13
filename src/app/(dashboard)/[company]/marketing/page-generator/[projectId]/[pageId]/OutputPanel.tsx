"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PgPageVersion } from "@/lib/page-generator";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

type OutputTab = "html" | "kg";

export function OutputPanel({
  pageId, companySlug, latestVersion, onReload, showToast,
}: {
  pageId: string;
  companySlug: string;
  latestVersion: PgPageVersion | null;
  onReload: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [tab, setTab] = useState<OutputTab>("html");
  const [buildingHtml, setBuildingHtml] = useState(false);
  const [htmlStream, setHtmlStream] = useState("");
  const [buildingKg, setBuildingKg] = useState(false);

  const [siteUrl, setSiteUrl] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgUrl, setOrgUrl] = useState("");
  const [orgLogo, setOrgLogo] = useState("");

  const [previewMode, setPreviewMode] = useState<"code" | "iframe">("code");
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [wpBaseHref, setWpBaseHref] = useState<string | null>(null);
  const [wpStylesheets, setWpStylesheets] = useState<string[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);

  async function handleLoadWpStyles() {
    const url = wpSiteUrl.trim();
    if (!url) { showToast("Inserisci l'URL del sito WordPress"); return; }
    setLoadingStyles(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/page-generator/preview-styles?url=${encodeURIComponent(url)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Errore caricamento stili"); return; }
      setWpBaseHref(json.baseHref);
      setWpStylesheets(json.stylesheets);
      showToast(`${json.stylesheets.length} stylesheet caricati`);
    } finally {
      setLoadingStyles(false);
    }
  }

  async function handleBuildHtml() {
    setBuildingHtml(true);
    setHtmlStream("");
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}/build-html`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok || !res.body) {
      setBuildingHtml(false);
      showToast("Errore build HTML");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setHtmlStream(acc);
    }
    setBuildingHtml(false);
    setHtmlStream("");
    await onReload();
    showToast("HTML generato");
  }

  async function handleBuildKg() {
    setBuildingKg(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}/build-kg`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        site_url: siteUrl.trim() || undefined,
        org_name: orgName.trim() || undefined,
        org_url: orgUrl.trim() || undefined,
        org_logo: orgLogo.trim() || undefined,
      }),
    });
    setBuildingKg(false);
    if (res.ok) {
      showToast("Knowledge Graph generato");
      await onReload();
    } else {
      showToast("Errore build KG");
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => showToast(`${label} copiato negli appunti`),
      () => showToast("Errore copia"),
    );
  }

  function download(text: string, filename: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const htmlOutput = latestVersion?.html_output ?? "";
  const kgOutput = latestVersion?.kg_json ?? null;
  const kgString = kgOutput ? JSON.stringify(kgOutput, null, 2) : "";

  return (
    <div className="pg-output">
      <div className="pg-output-tabs">
        <button className={tab === "html" ? "act" : ""} onClick={() => setTab("html")}>HTML WordPress</button>
        <button className={tab === "kg" ? "act" : ""} onClick={() => setTab("kg")}>Knowledge Graph</button>
      </div>

      {tab === "html" && (
        <div className="pg-output-body">
          <div className="pg-output-actions">
            <button className="btn-save" onClick={handleBuildHtml} disabled={buildingHtml || !latestVersion}>
              {buildingHtml ? "Generazione..." : htmlOutput ? "Rigenera HTML" : "Genera HTML"}
            </button>
            {htmlOutput && !buildingHtml && (
              <>
                <button className="pg-btn-small" onClick={() => copyToClipboard(htmlOutput, "HTML")}>Copia</button>
                <button className="pg-btn-small" onClick={() => download(htmlOutput, "page.html", "text/html")}>Scarica</button>
                <div className="pg-mode-toggle" style={{ margin: "0 0 0 auto" }}>
                  <button className={previewMode === "code" ? "act" : ""} onClick={() => setPreviewMode("code")}>Codice</button>
                  <button className={previewMode === "iframe" ? "act" : ""} onClick={() => setPreviewMode("iframe")}>Preview</button>
                </div>
              </>
            )}
          </div>

          {buildingHtml && (
            <pre className="pg-streaming-text" style={{ background: "var(--bg2)", padding: 12, borderRadius: 6, maxHeight: "60vh" }}>
              {htmlStream || "Streaming in corso..."}
            </pre>
          )}

          {!buildingHtml && !htmlOutput && (
            <div className="comp-empty">Nessun HTML generato. Clicca &quot;Genera HTML&quot; per convertire la bozza.</div>
          )}

          {!buildingHtml && htmlOutput && previewMode === "code" && (
            <pre className="pg-code-block">{htmlOutput}</pre>
          )}

          {!buildingHtml && htmlOutput && previewMode === "iframe" && (
            <>
              <div className="pg-wp-preview-config">
                <input
                  type="url"
                  placeholder="URL sito WordPress (es. https://squaremarketing.it)"
                  value={wpSiteUrl}
                  onChange={(e) => setWpSiteUrl(e.target.value)}
                />
                <button className="pg-btn-small" onClick={handleLoadWpStyles} disabled={loadingStyles}>
                  {loadingStyles ? "Caricamento..." : wpStylesheets.length > 0 ? "Ricarica stili" : "Carica stili WP"}
                </button>
                {wpStylesheets.length > 0 && (
                  <button
                    className="pg-btn-small"
                    onClick={() => { setWpBaseHref(null); setWpStylesheets([]); }}
                    title="Torna alla preview senza stili WP"
                  >
                    Reset
                  </button>
                )}
              </div>
              <iframe
                className="pg-preview-iframe"
                sandbox="allow-same-origin"
                srcDoc={`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title>${wpBaseHref ? `<base href="${wpBaseHref}">` : ""}${wpStylesheets.map((s) => `<link rel="stylesheet" href="${s}">`).join("")}${wpStylesheets.length === 0 ? `<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:820px;margin:0 auto;padding:32px;line-height:1.7;color:#222}h1{font-size:2rem}h2{margin-top:2em}img{max-width:100%;height:auto}</style>` : ""}</head><body>${htmlOutput}</body></html>`}
              />
            </>
          )}
        </div>
      )}

      {tab === "kg" && (
        <div className="pg-output-body">
          <div className="pg-kg-config">
            <div className="pg-section">
              <label>URL sito (dominio base)</label>
              <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://tuosito.it" />
            </div>
            <div className="modal-row">
              <div>
                <label>Nome organizzazione</label>
                <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Es. La Tua Azienda Srl" />
              </div>
              <div>
                <label>URL organizzazione</label>
                <input value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)} placeholder="https://tuosito.it" />
              </div>
            </div>
            <div className="pg-section">
              <label>Logo (URL)</label>
              <input value={orgLogo} onChange={(e) => setOrgLogo(e.target.value)} placeholder="https://tuosito.it/logo.png" />
            </div>
          </div>

          <div className="pg-output-actions">
            <button className="btn-save" onClick={handleBuildKg} disabled={buildingKg || !latestVersion}>
              {buildingKg ? "Generazione..." : kgOutput ? "Rigenera KG" : "Genera Knowledge Graph"}
            </button>
            {kgString && (
              <>
                <button className="pg-btn-small" onClick={() => copyToClipboard(kgString, "JSON-LD")}>Copia</button>
                <button className="pg-btn-small" onClick={() => download(kgString, "knowledge-graph.jsonld", "application/ld+json")}>Scarica</button>
                <a
                  className="pg-btn-small"
                  style={{ textDecoration: "none" }}
                  href={`/${companySlug}/marketing/geo-tool/audit/kg-optimizer`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Apri KG Optimizer &#x2197;
                </a>
              </>
            )}
          </div>

          {!kgOutput && !buildingKg && (
            <div className="comp-empty">Nessun Knowledge Graph. Clicca &quot;Genera Knowledge Graph&quot;.</div>
          )}

          {kgString && !buildingKg && (
            <pre className="pg-code-block">{kgString}</pre>
          )}
        </div>
      )}
    </div>
  );
}
