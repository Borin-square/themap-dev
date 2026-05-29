"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, AIReferralEntry } from "@/lib/geo/types";
import { emptyMonitoring } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";

const AI_SOURCES = ["ChatGPT", "Claude", "Perplexity", "Gemini", "AI Overviews", "Copilot", "Altro"];

export default function AIReferralPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [showForm, setShowForm] = useState(false);
  const [formSource, setFormSource] = useState("ChatGPT");
  const [formVisits, setFormVisits] = useState("");
  const [formPages, setFormPages] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));

  const monitoring = project.monitoring ?? emptyMonitoring();
  const entries = monitoring.aiReferrals;

  function addEntry() {
    if (!formVisits) return;
    const entry: AIReferralEntry = {
      id: crypto.randomUUID(),
      date: formDate,
      source: formSource,
      visits: parseInt(formVisits, 10) || 0,
      topPages: formPages.split(",").map((p) => p.trim()).filter(Boolean),
      notes: formNotes,
    };
    setProject((p) => ({
      ...p,
      monitoring: {
        ...(p.monitoring ?? emptyMonitoring()),
        aiReferrals: [...(p.monitoring?.aiReferrals ?? []), entry],
      },
    }));
    setFormVisits("");
    setFormPages("");
    setFormNotes("");
    setShowForm(false);
  }

  function removeEntry(id: string) {
    setProject((p) => ({
      ...p,
      monitoring: {
        ...(p.monitoring ?? emptyMonitoring()),
        aiReferrals: (p.monitoring?.aiReferrals ?? []).filter((e) => e.id !== id),
      },
    }));
  }

  // Group by source
  const bySource = entries.reduce<Record<string, { visits: number; count: number }>>((acc, e) => {
    if (!acc[e.source]) acc[e.source] = { visits: 0, count: 0 };
    acc[e.source].visits += e.visits;
    acc[e.source].count++;
    return acc;
  }, {});

  const totalVisits = entries.reduce((sum, e) => sum + e.visits, 0);

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">AI Referral</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Chiudi" : "+ Aggiungi Dato"}
          </button>
        </div>
      </div>

      {/* Setup guide */}
      <div className="geo-audit-config-summary" style={{ marginBottom: 16 }}>
        Traccia il traffico proveniente da piattaforme AI. Puoi inserire i dati manualmente da GA4 o altri analytics.
        Cerca i referral da: <strong>chat.openai.com</strong>, <strong>claude.ai</strong>, <strong>perplexity.ai</strong>, <strong>gemini.google.com</strong>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="geo-gen-controls" style={{ marginBottom: 16 }}>
          <div className="geo-gen-row">
            <div>
              <label className="geo-label">Data</label>
              <input type="date" className="geo-select" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div>
              <label className="geo-label">Fonte AI</label>
              <select className="geo-select" value={formSource} onChange={(e) => setFormSource(e.target.value)}>
                {AI_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="geo-label">Visite</label>
              <input className="geo-select" type="number" placeholder="0" value={formVisits} onChange={(e) => setFormVisits(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="geo-label">Pagine top (virgola)</label>
              <input className="geo-add-input" placeholder="/pagina1, /pagina2" value={formPages} onChange={(e) => setFormPages(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <label className="geo-label">Note</label>
            <input className="geo-add-input" placeholder="Note opzionali" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="geo-btn geo-btn-accent" onClick={addEntry} disabled={!formVisits}>Salva</button>
          </div>
        </div>
      )}

      {/* KPIs */}
      {entries.length > 0 && (
        <>
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className="geo-kpi-n">{totalVisits}</span>
              <span className="geo-kpi-l">Visite Totali AI</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{entries.length}</span>
              <span className="geo-kpi-l">Data Points</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{Object.keys(bySource).length}</span>
              <span className="geo-kpi-l">Fonti AI</span>
            </div>
          </div>

          {/* By source cards */}
          <div className="geo-section-title">Per Fonte AI</div>
          <div className="geo-sent-llm-grid">
            {Object.entries(bySource).sort((a, b) => b[1].visits - a[1].visits).map(([source, data]) => (
              <div key={source} className="geo-sent-llm-card">
                <div className="geo-sent-llm-name">{source}</div>
                <div className="geo-sent-llm-score">{data.visits}</div>
                <div className="geo-sent-llm-count">{data.count} registrazioni</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="geo-section-title">Storico</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fonte</th>
                  <th>Visite</th>
                  <th>Pagine</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((e) => (
                  <tr key={e.id} className="geo-row">
                    <td style={{ fontSize: 11 }}>{new Date(e.date).toLocaleDateString("it-IT")}</td>
                    <td><span className="geo-tag">{e.source}</span></td>
                    <td style={{ fontWeight: 600 }}>{e.visits}</td>
                    <td style={{ fontSize: 11, color: "var(--fg2)", maxWidth: 200 }}>
                      {e.topPages.join(", ") || "-"}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--fg3)" }}>{e.notes || "-"}</td>
                    <td>
                      <button className="geo-btn-small" style={{ color: "var(--red)" }} onClick={() => removeEntry(e.id)}>
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {entries.length === 0 && !showForm && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessun dato</div>
          Aggiungi i dati di traffico AI dal tuo analytics per monitorare i referral dalle piattaforme AI.
        </div>
      )}
    </div>
  );
}
