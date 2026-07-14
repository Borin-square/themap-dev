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

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [selectedH2, setSelectedH2] = useState<number | null>(null);
  const [sectionInstruction, setSectionInstruction] = useState("");
  const [rebuildingSection, setRebuildingSection] = useState(false);
  const [sectionStream, setSectionStream] = useState("");

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

  const h2Sections = parseH2Sections(htmlOutput);

  async function handleOpenSectionModal() {
    setSectionModalOpen(true);
    // Preseleziona la prima voce disponibile (hero se presente, altrimenti primo H2)
    setSelectedH2(h2Sections.length > 0 ? h2Sections[0].index : null);
    setSectionInstruction("");
    setSectionStream("");
  }

  async function handleRebuildSection() {
    if (selectedH2 === null) { showToast("Seleziona una sezione"); return; }
    setRebuildingSection(true);
    setSectionStream("");
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}/rebuild-section`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ h2_index: selectedH2, user_instruction: sectionInstruction }),
    });
    if (!res.ok || !res.body) {
      setRebuildingSection(false);
      showToast("Errore rigenerazione sezione");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setSectionStream(acc);
    }
    setRebuildingSection(false);

    const errorMarker = "<!--__PG_STREAM_ERROR__:";
    const errorIdx = acc.indexOf(errorMarker);
    if (errorIdx !== -1) {
      const msg = acc.slice(errorIdx + errorMarker.length).replace(/-->\s*$/, "").trim();
      showToast(`Errore LLM: ${msg}`);
      return;
    }

    await onReload();
    setSectionModalOpen(false);
    setSectionInstruction("");
    setSectionStream("");
    showToast("Blocco rigenerato");
  }

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
            <button
              className="pg-btn-small"
              onClick={handleOpenSectionModal}
              disabled={!htmlOutput || h2Sections.length === 0}
              title={h2Sections.length === 0 ? "Genera prima l'HTML completo" : "Rigenera solo la hero o una sezione H2 con contesto"}
            >
              Rigenera blocco
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

      {sectionModalOpen && (
        <div className="pg-prompt-modal" role="dialog" aria-modal="true" onClick={() => !rebuildingSection && setSectionModalOpen(false)}>
          <div className="pg-prompt-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="pg-prompt-modal-head">
              <div>
                <strong>Rigenera un blocco</strong>
                <span style={{ fontSize: 11, color: "var(--fg3)", marginLeft: 8 }}>
                  {h2Sections.length > 0
                    ? `${h2Sections.filter((s) => s.kind === "hero").length ? "hero + " : ""}${h2Sections.filter((s) => s.kind === "h2").length} sezioni H2 rilevate`
                    : "nessun blocco rilevato"}
                </span>
              </div>
              <button className="pg-btn-small" onClick={() => setSectionModalOpen(false)} disabled={rebuildingSection}>
                Chiudi
              </button>
            </div>
            {h2Sections.length === 0 ? (
              <div className="pg-prompt-modal-section">
                <div className="comp-empty">
                  Nessun blocco rilevato nell&apos;HTML output. Genera prima l&apos;HTML completo.
                </div>
              </div>
            ) : (
              <div className="pg-section-modal-layout">
                <div className="pg-section-modal-list">
                  <div className="pg-prompt-modal-label">BLOCCHI</div>
                  {h2Sections.map((s) => {
                    const isSelected = selectedH2 === s.index;
                    const h2Ord = h2Sections.filter((x) => x.kind === "h2" && x.index <= s.index).length;
                    return (
                      <button
                        key={s.index}
                        className={"pg-section-modal-item" + (isSelected ? " act" : "")}
                        onClick={() => setSelectedH2(s.index)}
                        disabled={rebuildingSection}
                      >
                        <span className="pg-section-modal-num">
                          {s.kind === "hero" ? "HERO / INTRO" : `H2 · ${h2Ord}`}
                        </span>
                        <span className="pg-section-modal-title">{s.title || "(senza titolo)"}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="pg-section-modal-right">
                  {selectedH2 !== null && h2Sections.find((s) => s.index === selectedH2) && (
                    <>
                      <div className="pg-prompt-modal-label">
                        MARKUP ATTUALE (verrà sostituito)
                      </div>
                      <pre className="pg-prompt-modal-code" style={{ maxHeight: "28vh" }}>
                        {h2Sections.find((s) => s.index === selectedH2)!.html}
                      </pre>
                      <div className="pg-prompt-modal-label" style={{ marginTop: 12 }}>
                        ISTRUZIONE PER QUESTA RIGENERAZIONE (opzionale)
                      </div>
                      <textarea
                        className="pg-prompt-modal-textarea"
                        rows={5}
                        value={sectionInstruction}
                        onChange={(e) => setSectionInstruction(e.target.value)}
                        placeholder="Es. Trasforma questa sezione in un accordion con almeno 5 FAQ. Ogni domanda in <details><summary> con le classi del tema. Includi anche JSON-LD FAQPage se non presente altrove."
                        disabled={rebuildingSection}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                          {selectedH2 === -1
                            ? "Contesto passato: primo H2 come esempio di stile della pagina."
                            : "Contesto passato: sezione precedente e successiva come esempio di coerenza stilistica."}
                        </span>
                        <button className="btn-save" onClick={handleRebuildSection} disabled={rebuildingSection}>
                          {rebuildingSection ? "Rigenerazione in corso..." : selectedH2 === -1 ? "Rigenera hero" : "Rigenera blocco"}
                        </button>
                      </div>
                      {rebuildingSection && (
                        <>
                          <div className="pg-prompt-modal-label" style={{ marginTop: 12 }}>STREAMING</div>
                          <pre className="pg-prompt-modal-code" style={{ maxHeight: "30vh" }}>
                            {sectionStream || "Attesa risposta..."}
                          </pre>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ParsedSection = { kind: "hero" | "h2"; index: number; title: string; html: string; id: string | null };

/** Estrae hero (intro prima del primo H2) + sezioni H2 da un HTML output.
 *  - hero: kind="hero", index=-1, tutto il markup PRIMA del primo <h2>
 *  - h2:   kind="h2",   index=0..N-1, dal proprio <h2> di apertura fino al prossimo <h2> (o fine). */
function parseH2Sections(html: string): ParsedSection[] {
  if (!html) return [];
  const h2Re = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const matches: Array<{ index: number; tag: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(html)) !== null) {
    matches.push({ index: m.index, tag: m[0] });
  }
  const out: ParsedSection[] = [];
  const introEnd = matches.length > 0 ? matches[0].index : html.length;
  const introHtml = html.slice(0, introEnd);
  if (introHtml.trim()) {
    // Prova a estrarre il titolo dall'H1 se presente
    const h1Match = introHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const h1Title = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "Hero / Intro";
    out.push({ kind: "hero", index: -1, title: h1Title, html: introHtml, id: null });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const sectionHtml = html.slice(start, end);
    const titleMatch = matches[i].tag.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
    const idMatch = matches[i].tag.match(/\bid\s*=\s*["']([^"']+)["']/i);
    out.push({ kind: "h2", index: i, title, html: sectionHtml, id: idMatch ? idMatch[1] : null });
  }
  return out;
}
