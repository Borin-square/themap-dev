"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { supabase } from "@/lib/supabase";
import type { PgProject } from "@/lib/page-generator";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function PageGeneratorListPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.company as string;
  const company = getCompany(slug);

  const [projects, setProjects] = useState<PgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/projects?company=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
    } else {
      showToast("Errore nel caricamento progetti");
    }
    setLoading(false);
  }, [slug, showToast]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const token = await getToken();
    const res = await fetch("/api/page-generator/projects", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        company_slug: slug,
        project: { name: newName.trim() },
      }),
    });
    if (res.ok) {
      const { project } = await res.json();
      setNewName("");
      setCreating(false);
      router.push(`/${slug}/marketing/page-generator/${project.id}`);
    } else {
      showToast("Errore nella creazione");
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/projects/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setProjects((p) => p.filter((x) => x.id !== id));
      setConfirmDel(null);
      showToast("Progetto eliminato");
    } else {
      showToast("Errore nell'eliminazione");
    }
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
        <Link href={`/${slug}/marketing/design-test`} className="ee-tab">Design Test</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="mktg-page">
        <div className="mktg-head">
          <div className="mktg-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            {company?.name || slug} — Page Generator
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="comp-add" onClick={() => setCreating(true)}>+ Progetto</button>
          </div>
        </div>

        {loading ? (
          <div className="comp-empty">Caricamento...</div>
        ) : projects.length === 0 ? (
          <div className="comp-empty">
            Nessun progetto. Crea il primo per iniziare a generare pagine SEO.
          </div>
        ) : (
          <div className="mktg-table-wrap">
            <table className="mktg-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Autori</th>
                  <th>Casi studio</th>
                  <th>Design WP</th>
                  <th>Aggiornato</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="mktg-row">
                    <td className="mktg-td-name">
                      <Link href={`/${slug}/marketing/page-generator/${p.id}`} style={{ color: "var(--acc)" }}>
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.authors_page_url ? "\u2713" : "\u2014"}</td>
                    <td>{p.case_studies_page_url ? "\u2713" : "\u2014"}</td>
                    <td>{p.wp_design_snippet ? "\u2713" : "\u2014"}</td>
                    <td>{new Date(p.updated_at).toLocaleDateString("it-IT")}</td>
                    <td className="mktg-td-actions">
                      {confirmDel === p.id ? (
                        <span className="fws-confirm">
                          <button className="fws-confirm-yes" onClick={() => handleDelete(p.id)}>Si</button>
                          <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                        </span>
                      ) : (
                        <button className="comp-del" onClick={() => setConfirmDel(p.id)} title="Elimina">&#10005;</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>Nuovo progetto</h3>
            <label>Nome progetto *</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Es. Cluster prodotto X"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <div className="modal-foot">
              <button className="btn-cancel" onClick={() => setCreating(false)}>Annulla</button>
              <button className="btn-save" onClick={handleCreate} disabled={!newName.trim()}>Crea</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
