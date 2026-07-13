"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { supabase } from "@/lib/supabase";
import type { PgProject, PgProjectDraft } from "@/lib/page-generator";
import { PagesTab } from "./PagesTab";
import { AuthorsTab } from "./AuthorsTab";
import { CasesTab } from "./CasesTab";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

type Tab = "pages" | "authors" | "cases" | "settings";

export default function PageGeneratorProjectPage() {
  const params = useParams();
  const slug = params.company as string;
  const projectId = params.projectId as string;
  const company = getCompany(slug);

  const [project, setProject] = useState<PgProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("settings");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadProject = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { project } = await res.json();
      setProject(project);
      if (project.wp_design_snippet) setTab("pages");
    } else {
      showToast("Progetto non trovato");
    }
    setLoading(false);
  }, [projectId, showToast]);

  useEffect(() => { loadProject(); }, [loadProject]);

  async function saveProject(patch: Partial<PgProjectDraft>) {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/projects/${projectId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { project } = await res.json();
      setProject(project);
      showToast("Impostazioni salvate");
    } else {
      showToast("Errore nel salvataggio");
    }
  }

  if (loading) {
    return <div className="mktg-page"><div className="comp-empty">Caricamento...</div></div>;
  }
  if (!project) {
    return (
      <div className="mktg-page">
        <div className="comp-empty">
          Progetto non trovato. <Link href={`/${slug}/marketing/page-generator`}>Torna alla lista</Link>
        </div>
      </div>
    );
  }

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
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="mktg-page">
        <div className="mktg-head">
          <div className="mktg-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            <Link href={`/${slug}/marketing/page-generator`} style={{ color: "var(--fg2)", textDecoration: "none" }}>
              Page Generator
            </Link>
            <span style={{ color: "var(--fg3)", margin: "0 8px" }}>/</span>
            {project.name}
          </div>
        </div>

        <div className="ba-mode-bar">
          <button className={tab === "pages" ? "act" : ""} onClick={() => setTab("pages")}>Pagine</button>
          <button className={tab === "authors" ? "act" : ""} onClick={() => setTab("authors")}>Autori</button>
          <button className={tab === "cases" ? "act" : ""} onClick={() => setTab("cases")}>Casi studio</button>
          <button className={tab === "settings" ? "act" : ""} onClick={() => setTab("settings")}>Impostazioni</button>
        </div>

        {tab === "settings" && <SettingsTab project={project} onSave={saveProject} />}
        {tab === "pages" && <PagesTab projectId={project.id} companySlug={slug} showToast={showToast} />}
        {tab === "authors" && (
          <AuthorsTab projectId={project.id} authorsPageUrl={project.authors_page_url} showToast={showToast} />
        )}
        {tab === "cases" && (
          <CasesTab projectId={project.id} casesPageUrl={project.case_studies_page_url} showToast={showToast} />
        )}
      </div>
    </div>
  );
}

function SettingsTab({
  project, onSave,
}: {
  project: PgProject;
  onSave: (patch: Partial<PgProjectDraft>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PgProjectDraft>({
    name: project.name,
    wp_design_snippet: project.wp_design_snippet,
    wp_design_notes: project.wp_design_notes,
    wp_html_prompt: project.wp_html_prompt,
    tone_of_voice: project.tone_of_voice,
    authors_page_url: project.authors_page_url,
    case_studies_page_url: project.case_studies_page_url,
    drive_folder_url: project.drive_folder_url,
  });
  const [saving, setSaving] = useState(false);

  function upd<K extends keyof PgProjectDraft>(k: K, v: PgProjectDraft[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  }

  return (
    <div className="pg-settings">
      <div className="pg-section">
        <label>Nome progetto</label>
        <input value={draft.name ?? ""} onChange={(e) => upd("name", e.target.value)} />
      </div>

      <div className="pg-section">
        <label>Design WordPress — classi CSS / snippet HTML di riferimento</label>
        <p className="pg-hint">
          Incolla qui le classi CSS del tema o uno snippet HTML di un post già formattato.
          Verrà usato come riferimento per generare l&apos;HTML della pagina.
        </p>
        <textarea
          rows={12}
          value={draft.wp_design_snippet ?? ""}
          onChange={(e) => upd("wp_design_snippet", e.target.value)}
          placeholder={".entry-content h2 { ... }\n<h2 class=\"wp-block-heading\">...</h2>"}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      <div className="pg-section">
        <label>Note aggiuntive sul design (opzionale)</label>
        <textarea
          rows={3}
          value={draft.wp_design_notes ?? ""}
          onChange={(e) => upd("wp_design_notes", e.target.value)}
          placeholder="Es. usare sempre .btn-primary per le CTA, blocchi callout con .highlight-box..."
        />
      </div>

      <div className="pg-section">
        <label>Istruzioni aggiuntive per il prompt di generazione HTML (opzionale)</label>
        <p className="pg-hint">
          Testo che verrà iniettato nel system prompt di Claude come blocco &quot;ISTRUZIONI
          AGGIUNTIVE DEL PROGETTO&quot;, dopo le regole di aderenza allo stile e prima della
          struttura contenuto. NON sostituisce le regole di default: le integra. Il resto
          del progetto (design snippet, bozza, media, keyword) è già iniettato automaticamente.
        </p>
        <textarea
          rows={8}
          value={draft.wp_html_prompt ?? ""}
          onChange={(e) => upd("wp_html_prompt", e.target.value)}
          placeholder="Es. usa sempre grid-card-item per i box informativi, wrap il primo paragrafo in .big, preferisci ale-make per le liste numerate a step..."
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      <div className="pg-section">
        <label>Tone of voice</label>
        <textarea
          rows={4}
          value={draft.tone_of_voice ?? ""}
          onChange={(e) => upd("tone_of_voice", e.target.value)}
          placeholder="Es. professionale ma diretto, tu informale, frasi brevi, no jargon..."
        />
      </div>

      <div className="pg-section">
        <label>URL pagina autori</label>
        <p className="pg-hint">
          Da questa pagina verranno estratti gli autori (nome, ruolo, bio, foto).
        </p>
        <input
          value={draft.authors_page_url ?? ""}
          onChange={(e) => upd("authors_page_url", e.target.value || null)}
          placeholder="https://tuosito.it/il-team/"
        />
      </div>

      <div className="pg-section">
        <label>URL pagina casi studio</label>
        <p className="pg-hint">
          Da questa pagina verranno estratti i casi studio (titolo, cliente, risultati).
        </p>
        <input
          value={draft.case_studies_page_url ?? ""}
          onChange={(e) => upd("case_studies_page_url", e.target.value || null)}
          placeholder="https://tuosito.it/casi-studio/"
        />
      </div>

      <div className="pg-section">
        <label>URL cartella Google Drive (media)</label>
        <p className="pg-hint">
          Link pubblico &quot;chiunque con il link&quot;. I media dentro potranno essere
          embeddati nelle pagine.
        </p>
        <input
          value={draft.drive_folder_url ?? ""}
          onChange={(e) => upd("drive_folder_url", e.target.value || null)}
          placeholder="https://drive.google.com/drive/folders/..."
        />
      </div>

      <div className="pg-actions">
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? "Salvataggio..." : "Salva impostazioni"}
        </button>
      </div>
    </div>
  );
}
