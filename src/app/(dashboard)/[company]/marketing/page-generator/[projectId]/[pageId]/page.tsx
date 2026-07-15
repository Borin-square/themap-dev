"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { supabase } from "@/lib/supabase";
import {
  PG_STATUS_LABELS, PG_STATUSES,
  type PgPage, type PgPageDraft, type PgPageVersion, type PgSection, type PgStatus,
  type PgAuthor, type PgCaseStudy,
} from "@/lib/page-generator";
import { MediaPanel } from "./MediaPanel";
import { OutputPanel } from "./OutputPanel";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function PageEditor() {
  const params = useParams();
  const slug = params.company as string;
  const projectId = params.projectId as string;
  const pageId = params.pageId as string;
  const company = getCompany(slug);

  const [page, setPage] = useState<PgPage | null>(null);
  const [versions, setVersions] = useState<PgPageVersion[]>([]);
  const [authors, setAuthors] = useState<PgAuthor[]>([]);
  const [cases, setCases] = useState<PgCaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [regenSection, setRegenSection] = useState<string | null>(null);
  const [regenInstructions, setRegenInstructions] = useState("");
  const [regenStreamingText, setRegenStreamingText] = useState("");
  const [rightTab, setRightTab] = useState<"draft" | "output">("draft");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { page, versions } = await res.json();
      setPage(page);
      setVersions(versions);
      // Carica autori e casi del progetto
      const [authRes, caseRes] = await Promise.all([
        fetch(`/api/page-generator/authors?project=${projectId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/page-generator/case-studies?project=${projectId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (authRes.ok) setAuthors((await authRes.json()).authors);
      if (caseRes.ok) setCases((await caseRes.json()).cases);
    } else {
      showToast("Pagina non trovata");
    }
    setLoading(false);
  }, [pageId, projectId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function updatePage(patch: Partial<PgPageDraft>) {
    setSavingField(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { page } = await res.json();
      setPage(page);
    } else {
      showToast("Errore nel salvataggio");
    }
    setSavingField(false);
  }

  async function handleGenerateDraft() {
    if (!page?.kw_main.trim()) {
      showToast("Inserisci prima la keyword principale");
      return;
    }
    setGenerating(true);
    setStreamingText("");
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}/draft`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok || !res.body) {
      setGenerating(false);
      showToast("Errore nella generazione");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setStreamingText(acc);
    }
    setGenerating(false);
    setStreamingText("");
    await load();
    showToast("Bozza generata");
  }

  async function handleRegenerateSection(sectionId: string) {
    if (!latestVersion) return;
    setRegenSection(sectionId);
    setRegenStreamingText("");
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${pageId}/section`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: sectionId,
        version_no: latestVersion.version_no,
        instructions: regenInstructions || undefined,
      }),
    });
    if (!res.ok || !res.body) {
      setRegenSection(null);
      showToast("Errore nella rigenerazione");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setRegenStreamingText(acc);
    }
    setRegenSection(null);
    setRegenInstructions("");
    setRegenStreamingText("");
    await load();
    showToast("Sezione rigenerata");
  }

  async function handleUpdateSectionBody(sectionId: string, newBody: string) {
    if (!latestVersion) return;
    const updated = latestVersion.sections.map((s) =>
      s.id === sectionId ? { ...s, body: newBody } : s,
    );
    const draft = updated
      .sort((a, b) => a.order - b.order)
      .map((s, i) => (i === 0 && s.title === "Introduzione") ? s.body : `## ${s.title}\n\n${s.body}`)
      .join("\n\n");

    const token = await getToken();
    // Aggiornamento diretto via API version (non ancora implementata come endpoint dedicato: usiamo un endpoint helper)
    await fetch(`/api/page-generator/versions/${latestVersion.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sections: updated, draft_text: draft }),
    });
    await load();
  }

  if (loading) {
    return <div className="mktg-page"><div className="comp-empty">Caricamento...</div></div>;
  }
  if (!page) {
    return (
      <div className="mktg-page">
        <div className="comp-empty">
          Pagina non trovata. <Link href={`/${slug}/marketing/page-generator/${projectId}`}>Torna al progetto</Link>
        </div>
      </div>
    );
  }

  const latestVersion = versions[0] ?? null;

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
        <span className="ee-tab active">Page Generator</span>
        <Link href={`/${slug}/marketing/design-test`} className="ee-tab">Design Test</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="mktg-page">
        <div className="mktg-head">
          <div className="mktg-title" style={{ flexWrap: "wrap" }}>
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            <Link href={`/${slug}/marketing/page-generator`} style={{ color: "var(--fg2)", textDecoration: "none" }}>
              Page Generator
            </Link>
            <span style={{ color: "var(--fg3)", margin: "0 8px" }}>/</span>
            <Link href={`/${slug}/marketing/page-generator/${projectId}`} style={{ color: "var(--fg2)", textDecoration: "none" }}>
              Progetto
            </Link>
            <span style={{ color: "var(--fg3)", margin: "0 8px" }}>/</span>
            <span>{page.title || page.kw_main || "Nuova pagina"}</span>
            <span className={`pg-type-badge pg-type-${page.page_type}`} style={{ marginLeft: 12 }}>
              {page.page_type === "pillar" ? "Pillar" : "Cluster"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={page.status}
              onChange={(e) => updatePage({ status: e.target.value as PgStatus })}
              disabled={savingField}
              style={{ padding: "6px 10px", borderRadius: 6 }}
            >
              {PG_STATUSES.map((s) => (
                <option key={s} value={s}>{PG_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pg-editor">
          <div className="pg-editor-left">
            <PageInputForm
              page={page}
              authors={authors}
              cases={cases}
              onSave={updatePage}
              savingField={savingField}
            />
            <MediaPanel
              pageId={page.id}
              companySlug={slug}
              kwContext={page.kw_main}
              showToast={showToast}
            />
          </div>

          <div className="pg-editor-right">
            <div className="pg-mode-toggle" style={{ margin: 0 }}>
              <button className={rightTab === "draft" ? "act" : ""} onClick={() => setRightTab("draft")}>Bozza</button>
              <button className={rightTab === "output" ? "act" : ""} onClick={() => setRightTab("output")}>Output</button>
            </div>

            {rightTab === "draft" && (
              <>
                <div className="pg-draft-head">
                  <h3 style={{ margin: 0 }}>Bozza (topical authority)</h3>
                  <button
                    className="btn-save"
                    onClick={handleGenerateDraft}
                    disabled={generating || !page.kw_main.trim()}
                  >
                    {generating ? "Generazione..." : latestVersion ? "Rigenera intera pagina" : "Genera bozza"}
                  </button>
                </div>

                {generating && (
                  <div className="pg-streaming">
                    <div className="pg-streaming-label">Streaming in corso...</div>
                    <pre className="pg-streaming-text">{streamingText || "In attesa del primo token..."}</pre>
                  </div>
                )}

                {!generating && latestVersion && (
                  <SectionsEditor
                    sections={latestVersion.sections}
                    versionNo={latestVersion.version_no}
                    totalVersions={versions.length}
                    onRegenerate={handleRegenerateSection}
                    onUpdateBody={handleUpdateSectionBody}
                    regeneratingSectionId={regenSection}
                    regenStreamingText={regenStreamingText}
                    regenInstructions={regenInstructions}
                    setRegenInstructions={setRegenInstructions}
                  />
                )}

                {!generating && !latestVersion && (
                  <div className="comp-empty">
                    Nessuna bozza. Compila keyword e information gain, poi clicca &quot;Genera bozza&quot;.
                  </div>
                )}
              </>
            )}

            {rightTab === "output" && (
              <OutputPanel
                pageId={page.id}
                projectId={page.project_id}
                companySlug={slug}
                latestVersion={latestVersion}
                onReload={load}
                showToast={showToast}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Input form  ───────────────────────── */

function PageInputForm({
  page, authors, cases, onSave, savingField,
}: {
  page: PgPage;
  authors: PgAuthor[];
  cases: PgCaseStudy[];
  onSave: (patch: Partial<PgPageDraft>) => Promise<void>;
  savingField: boolean;
}) {
  const [title, setTitle] = useState(page.title);
  const [kwMain, setKwMain] = useState(page.kw_main);
  const [kwSecondary, setKwSecondary] = useState(page.kw_secondary.join(", "));
  const [searchIntent, setSearchIntent] = useState(page.search_intent ?? "");
  const [infoGain, setInfoGain] = useState(page.info_gain_text);
  const [sourceDocExtracted, setSourceDocExtracted] = useState(page.source_doc_extracted ?? "");
  const [metaDescription, setMetaDescription] = useState(page.meta_description ?? "");
  const [referenceUrls, setReferenceUrls] = useState((page.reference_urls ?? []).join("\n"));

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTitle(page.title);
    setKwMain(page.kw_main);
    setKwSecondary(page.kw_secondary.join(", "));
    setSearchIntent(page.search_intent ?? "");
    setInfoGain(page.info_gain_text);
    setSourceDocExtracted(page.source_doc_extracted ?? "");
    setMetaDescription(page.meta_description ?? "");
    setReferenceUrls((page.reference_urls ?? []).join("\n"));
  }, [page]);

  function debouncedSave(patch: Partial<PgPageDraft>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSave(patch), 700);
  }

  const sourceFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleSourceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingSource(true);
    setUploadError(null);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/page-generator/pages/${page.id}/upload-source`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Errore upload" }));
        throw new Error(error || "Errore upload");
      }
      const { extracted, url } = await res.json();
      setSourceDocExtracted(extracted || "");
      await onSave({ source_doc_url: url, source_doc_extracted: extracted || "" });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore upload");
    } finally {
      setUploadingSource(false);
    }
  }

  async function handleSourceRemove() {
    setUploadError(null);
    await onSave({ source_doc_url: null });
  }

  return (
    <div className="pg-input-form">
      <div className="pg-section">
        <label>Titolo H1 (opzionale)</label>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); debouncedSave({ title: e.target.value }); }}
          placeholder="Se vuoto, verrà generato da Claude"
        />
      </div>

      <div className="pg-section">
        <label>Keyword principale *</label>
        <input
          value={kwMain}
          onChange={(e) => { setKwMain(e.target.value); debouncedSave({ kw_main: e.target.value }); }}
        />
      </div>

      <div className="pg-section">
        <label>Keyword secondarie (separate da virgola)</label>
        <textarea
          rows={2}
          value={kwSecondary}
          onChange={(e) => {
            setKwSecondary(e.target.value);
            const arr = e.target.value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
            debouncedSave({ kw_secondary: arr });
          }}
        />
      </div>

      <div className="pg-section">
        <label>Intento di ricerca</label>
        <input
          value={searchIntent}
          onChange={(e) => { setSearchIntent(e.target.value); debouncedSave({ search_intent: e.target.value || null }); }}
          placeholder="Es. informational / commercial / navigational"
        />
      </div>

      <div className="pg-section">
        <label>Information gain *</label>
        <p className="pg-hint">
          Cosa questa pagina dice che le altre sulla stessa KW NON dicono. È il valore differenziante.
        </p>
        <textarea
          rows={6}
          value={infoGain}
          onChange={(e) => { setInfoGain(e.target.value); debouncedSave({ info_gain_text: e.target.value }); }}
          placeholder="Es. spieghiamo l'impatto del cluster su tempi di indicizzazione con dati interni raccolti su 40 clienti B2B..."
        />
      </div>

      <div className="pg-section">
        <label>Documento sorgente</label>
        <p className="pg-hint">
          Materiale grezzo (report, appunti, trascrizioni). Incolla il testo o carica un file (PDF, TXT, MD — max 15MB). Claude lo userà come fonte.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <input
            ref={sourceFileRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            style={{ display: "none" }}
            onChange={handleSourceUpload}
          />
          <button
            type="button"
            className="pg-btn-small"
            onClick={() => sourceFileRef.current?.click()}
            disabled={uploadingSource}
          >
            {uploadingSource ? "Estrazione..." : (page.source_doc_url ? "Sostituisci file" : "Carica file")}
          </button>
          {page.source_doc_url && !uploadingSource && (
            <>
              <a
                href={page.source_doc_url}
                target="_blank"
                rel="noreferrer"
                className="pg-hint"
                style={{ margin: 0, textDecoration: "underline" }}
              >
                File caricato ↗
              </a>
              <button type="button" className="pg-btn-small" onClick={handleSourceRemove}>
                Rimuovi
              </button>
            </>
          )}
          {uploadError && (
            <span className="pg-hint" style={{ margin: 0, color: "#ef4444" }}>{uploadError}</span>
          )}
        </div>
        <textarea
          rows={6}
          value={sourceDocExtracted}
          onChange={(e) => { setSourceDocExtracted(e.target.value); debouncedSave({ source_doc_extracted: e.target.value || null }); }}
          placeholder="Incolla qui il testo del documento sorgente, oppure carica un file sopra."
        />
      </div>

      <div className="pg-section">
        <label>Meta description</label>
        <textarea
          rows={2}
          value={metaDescription}
          onChange={(e) => { setMetaDescription(e.target.value); debouncedSave({ meta_description: e.target.value || null }); }}
          placeholder="Max ~155 caratteri"
          maxLength={200}
        />
        <div className="pg-hint" style={{ textAlign: "right" }}>{metaDescription.length}/155</div>
      </div>

      <div className="pg-section">
        <label>Esempi di design (una URL per riga)</label>
        <p className="pg-hint">
          URL di altre pagine dello stesso sito che vuoi che Claude prenda come esempio
          di markup e classi da riprodurre. Passate al prompt come riferimento visivo.
        </p>
        <textarea
          rows={4}
          value={referenceUrls}
          onChange={(e) => {
            setReferenceUrls(e.target.value);
            const urls = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
            debouncedSave({ reference_urls: urls });
          }}
          placeholder={"https://tuosito.it/pagina-simile-gia-esistente\nhttps://tuosito.it/altra-pagina-del-tema"}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      <ChipSelector
        label="Autori assegnati"
        hint="Verranno menzionati per E-E-A-T e usati nel Knowledge Graph"
        items={authors.map((a) => ({ id: a.id, label: a.name, sub: a.role }))}
        selected={page.author_ids}
        onChange={(ids) => onSave({ author_ids: ids })}
        emptyLabel="Nessun autore nel progetto. Vai al tab Autori per aggiungerli."
      />

      <ChipSelector
        label="Casi studio da citare"
        hint="Verranno usati come esempi concreti nella bozza"
        items={cases.map((c) => ({ id: c.id, label: c.title, sub: c.client }))}
        selected={page.case_study_ids}
        onChange={(ids) => onSave({ case_study_ids: ids })}
        emptyLabel="Nessun caso studio nel progetto."
      />

      {savingField && <div className="pg-hint">Salvataggio...</div>}
    </div>
  );
}

/* ─────────────────────────  Sections editor  ───────────────────────── */

function SectionsEditor({
  sections, versionNo, totalVersions,
  onRegenerate, onUpdateBody,
  regeneratingSectionId, regenStreamingText,
  regenInstructions, setRegenInstructions,
}: {
  sections: PgSection[];
  versionNo: number;
  totalVersions: number;
  onRegenerate: (sectionId: string) => Promise<void>;
  onUpdateBody: (sectionId: string, newBody: string) => Promise<void>;
  regeneratingSectionId: string | null;
  regenStreamingText: string;
  regenInstructions: string;
  setRegenInstructions: (v: string) => void;
}) {
  return (
    <div className="pg-sections">
      <div className="pg-version-info">
        Versione {versionNo} {totalVersions > 1 && <span>(su {totalVersions})</span>}
      </div>
      {sections
        .sort((a, b) => a.order - b.order)
        .map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            onRegenerate={onRegenerate}
            onUpdateBody={onUpdateBody}
            isRegenerating={regeneratingSectionId === s.id}
            regenStreamingText={regeneratingSectionId === s.id ? regenStreamingText : ""}
            regenInstructions={regenInstructions}
            setRegenInstructions={setRegenInstructions}
          />
        ))}
    </div>
  );
}

function SectionCard({
  section, onRegenerate, onUpdateBody,
  isRegenerating, regenStreamingText,
  regenInstructions, setRegenInstructions,
}: {
  section: PgSection;
  onRegenerate: (sectionId: string) => Promise<void>;
  onUpdateBody: (sectionId: string, newBody: string) => Promise<void>;
  isRegenerating: boolean;
  regenStreamingText: string;
  regenInstructions: string;
  setRegenInstructions: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [editBody, setEditBody] = useState(section.body);

  useEffect(() => { setEditBody(section.body); }, [section.body]);

  return (
    <div className="pg-section-card">
      <div className="pg-section-head">
        <h4>{section.title}</h4>
        <div style={{ display: "flex", gap: 6 }}>
          {!editing && !isRegenerating && (
            <>
              <button className="pg-btn-small" onClick={() => setEditing(true)}>Modifica</button>
              <button className="pg-btn-small" onClick={() => setShowRegen((v) => !v)}>Rigenera</button>
            </>
          )}
        </div>
      </div>

      {showRegen && !isRegenerating && (
        <div className="pg-regen-controls">
          <textarea
            rows={2}
            value={regenInstructions}
            onChange={(e) => setRegenInstructions(e.target.value)}
            placeholder="Istruzioni opzionali (es. più concreto, meno lungo, aggiungi esempio pratico)"
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="pg-btn-small" onClick={() => setShowRegen(false)}>Annulla</button>
            <button className="btn-save" onClick={() => { setShowRegen(false); onRegenerate(section.id); }}>
              Rigenera sezione
            </button>
          </div>
        </div>
      )}

      {isRegenerating ? (
        <pre className="pg-streaming-text">{regenStreamingText || "Rigenerazione in corso..."}</pre>
      ) : editing ? (
        <>
          <textarea
            rows={10}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
            <button className="pg-btn-small" onClick={() => { setEditBody(section.body); setEditing(false); }}>Annulla</button>
            <button className="btn-save" onClick={async () => { await onUpdateBody(section.id, editBody); setEditing(false); }}>
              Salva
            </button>
          </div>
        </>
      ) : (
        <div className="pg-section-body">{section.body}</div>
      )}
    </div>
  );
}

/* ─────────────────────────  Chip selector  ───────────────────────── */

function ChipSelector({
  label, hint, items, selected, onChange, emptyLabel,
}: {
  label: string;
  hint?: string;
  items: { id: string; label: string; sub?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}) {
  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    onChange(next);
  }
  return (
    <div className="pg-section">
      <label>{label}</label>
      {hint && <p className="pg-hint">{hint}</p>}
      {items.length === 0 ? (
        <div className="pg-hint" style={{ fontStyle: "italic" }}>{emptyLabel}</div>
      ) : (
        <div className="pg-chips">
          {items.map((it) => {
            const on = selected.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                className={`pg-chip${on ? " pg-chip-on" : ""}`}
                onClick={() => toggle(it.id)}
                title={it.sub}
              >
                {on ? "\u2713 " : ""}{it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
