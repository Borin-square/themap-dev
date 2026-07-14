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
  pageId, projectId, companySlug, latestVersion, onReload, showToast,
}: {
  pageId: string;
  projectId: string;
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
  const [wpCss, setWpCss] = useState<string>("");
  const [wpStylesInfo, setWpStylesInfo] = useState<string>("");
  const [loadingStyles, setLoadingStyles] = useState(false);

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSystem, setPromptSystem] = useState("");
  const [promptUser, setPromptUser] = useState("");
  const [promptHasCustom, setPromptHasCustom] = useState(false);
  const [promptHasDraft, setPromptHasDraft] = useState(false);
  const [customPromptDraft, setCustomPromptDraft] = useState("");
  const [savingCustomPrompt, setSavingCustomPrompt] = useState(false);
  const [modelChoice, setModelChoice] = useState("claude-opus-4-7");
  const [thinkingChoice, setThinkingChoice] = useState(true);
  const [savingLlmCfg, setSavingLlmCfg] = useState(false);

  async function loadPromptPreview() {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}/preview-prompt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error || "Errore caricamento prompt"); return; }
    setPromptSystem(json.system || "");
    setPromptUser(json.user || "");
    setPromptHasCustom(!!json.hasCustomPrompt);
    setPromptHasDraft(!!json.hasDraft);
  }

  async function handleShowPrompt() {
    setPromptModalOpen(true);
    setPromptLoading(true);
    try {
      // Carica anche il valore attuale di wp_html_prompt dal progetto
      const token = await getToken();
      const projRes = await fetch(`/api/page-generator/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const projJson = await projRes.json();
      if (projRes.ok) {
        setCustomPromptDraft(projJson.project?.wp_html_prompt ?? "");
        setModelChoice(projJson.project?.html_model ?? "claude-opus-4-7");
        setThinkingChoice(projJson.project?.html_thinking !== false);
      }
      await loadPromptPreview();
    } finally {
      setPromptLoading(false);
    }
  }

  async function handleSaveLlmCfg(newModel: string, newThinking: boolean) {
    setSavingLlmCfg(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/page-generator/projects/${projectId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ html_model: newModel, html_thinking: newThinking }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || "Errore salvataggio config LLM");
        return;
      }
      setModelChoice(newModel);
      setThinkingChoice(newThinking);
      showToast(`${newModel.split("-").slice(1).join(" ")} · thinking ${newThinking ? "on" : "off"}`);
    } finally {
      setSavingLlmCfg(false);
    }
  }

  async function handleSaveCustomPrompt() {
    setSavingCustomPrompt(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/page-generator/projects/${projectId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ wp_html_prompt: customPromptDraft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(j.error || "Errore salvataggio prompt");
        return;
      }
      showToast("Istruzioni salvate");
      await loadPromptPreview();
    } finally {
      setSavingCustomPrompt(false);
    }
  }

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
      setWpCss(json.css || "");
      const kb = Math.round((json.cssBytes || 0) / 1024);
      const info = `${json.stylesheetsLoaded}/${json.stylesheetsFound} CSS · ${json.inlineStylesFound} inline · ${kb} KB`;
      setWpStylesInfo(info);
      showToast(info);
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

    // Rileva errore stream server-side (l'HTML sul DB NON è stato aggiornato)
    const errorMarker = "<!--__PG_STREAM_ERROR__:";
    const errorIdx = acc.indexOf(errorMarker);
    if (errorIdx !== -1) {
      const msg = acc.slice(errorIdx + errorMarker.length).replace(/-->\s*$/, "").trim();
      showToast(`Errore LLM: ${msg}`);
      return; // NON ricaricare: html_output nel DB è ancora la versione precedente
    }

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
            <button
              className="pg-btn-small"
              onClick={handleShowPrompt}
              disabled={!latestVersion}
              title="Mostra il prompt esatto che verrà mandato a Claude"
            >
              Mostra prompt
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
                  {loadingStyles ? "Caricamento..." : wpCss ? "Ricarica stili" : "Carica stili WP"}
                </button>
                {wpCss && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--fg3)" }}>{wpStylesInfo}</span>
                    <button
                      className="pg-btn-small"
                      onClick={() => { setWpBaseHref(null); setWpCss(""); setWpStylesInfo(""); }}
                      title="Torna alla preview senza stili WP"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
              <iframe
                className="pg-preview-iframe"
                sandbox="allow-same-origin"
                srcDoc={`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title>${wpBaseHref ? `<base href="${wpBaseHref}">` : ""}${wpCss ? `<style>${wpCss}</style>` : `<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:820px;margin:0 auto;padding:32px;line-height:1.7;color:#222}h1{font-size:2rem}h2{margin-top:2em}img{max-width:100%;height:auto}</style>`}</head><body>${htmlOutput}</body></html>`}
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

      {promptModalOpen && (
        <div className="pg-prompt-modal" role="dialog" aria-modal="true" onClick={() => setPromptModalOpen(false)}>
          <div className="pg-prompt-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="pg-prompt-modal-head">
              <div>
                <strong>Prompt inviato a Claude</strong>
                <span style={{ fontSize: 11, color: "var(--fg3)", marginLeft: 8 }}>
                  {promptHasCustom ? "· istruzioni progetto attive" : "· nessuna istruzione custom"}
                  {promptHasDraft ? "" : " · BOZZA VUOTA"}
                </span>
              </div>
              <button className="pg-btn-small" onClick={() => setPromptModalOpen(false)}>Chiudi</button>
            </div>
            {promptLoading ? (
              <div className="comp-empty">Caricamento prompt...</div>
            ) : (
              <>
                <div className="pg-prompt-modal-config">
                  <div className="pg-prompt-modal-config-row">
                    <div className="pg-prompt-modal-label" style={{ marginBottom: 0 }}>MODELLO</div>
                    <select
                      value={modelChoice}
                      onChange={(e) => handleSaveLlmCfg(e.target.value, thinkingChoice)}
                      disabled={savingLlmCfg}
                    >
                      <option value="claude-opus-4-7">Opus 4.7 (max aderenza)</option>
                      <option value="claude-sonnet-4-6">Sonnet 4.6 (veloce)</option>
                    </select>
                    <label className="pg-prompt-modal-checkbox">
                      <input
                        type="checkbox"
                        checked={thinkingChoice}
                        onChange={(e) => handleSaveLlmCfg(modelChoice, e.target.checked)}
                        disabled={savingLlmCfg}
                      />
                      Extended thinking
                    </label>
                    <span className="pg-prompt-modal-temp">
                      {thinkingChoice ? "temperature=1 (API)" : "temperature=0"}
                    </span>
                  </div>
                  <div>
                    <div className="pg-prompt-modal-label" style={{ marginTop: 8 }}>
                      ISTRUZIONI AGGIUNTIVE DEL PROGETTO (editabili)
                    </div>
                    <textarea
                      className="pg-prompt-modal-textarea"
                      rows={10}
                      value={customPromptDraft}
                      onChange={(e) => setCustomPromptDraft(e.target.value)}
                      placeholder="Es. Per gli elenchi di card informative usa sempre <div class='grid-card-item'>. Non usare wp-block-heading."
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                      <button className="btn-save" onClick={handleSaveCustomPrompt} disabled={savingCustomPrompt}>
                        {savingCustomPrompt ? "Salvataggio..." : "Salva e ricarica prompt"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pg-prompt-modal-payload">
                  <div className="pg-prompt-modal-pane">
                    <div className="pg-prompt-modal-label">
                      SYSTEM
                      <button
                        className="pg-btn-small"
                        style={{ marginLeft: 8 }}
                        onClick={() => copyToClipboard(promptSystem, "System prompt")}
                      >
                        Copia
                      </button>
                    </div>
                    <pre className="pg-prompt-modal-code">{promptSystem}</pre>
                  </div>
                  <div className="pg-prompt-modal-pane">
                    <div className="pg-prompt-modal-label">
                      USER
                      <button
                        className="pg-btn-small"
                        style={{ marginLeft: 8 }}
                        onClick={() => copyToClipboard(promptUser, "User message")}
                      >
                        Copia
                      </button>
                    </div>
                    <pre className="pg-prompt-modal-code">{promptUser}</pre>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
