"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, GEOPrompt, GEOIntent, GEOFunnel } from "@/lib/geo/types";
import { GEO_INTENTS, GEO_FUNNELS } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { enrichPromptScores } from "@/lib/geo/scoring";

/* ── Chip Section ── */

function ChipSection({ label, items, onChange, placeholder }: {
  label: string; items: string[]; onChange: (items: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (v && !items.includes(v)) { onChange([...items, v]); setDraft(""); }
  }
  return (
    <div className="sc-config-section">
      <div className="sc-config-label">{label}</div>
      <div className="sc-chips">
        {items.map((item) => (
          <span key={item} className="sc-chip">
            {item}
            <button onClick={() => onChange(items.filter((i) => i !== item))}>{"\u2715"}</button>
          </span>
        ))}
        <input
          className="sc-chip-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

export default function PromptGeneratorPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GEOPrompt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [focusIntent, setFocusIntent] = useState("");
  const [focusFunnel, setFocusFunnel] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function updateConfig(patch: Partial<GEOProject["config"]>) {
    setProject((prev) => ({ ...prev, config: { ...prev.config, ...patch } }));
  }

  async function handleGenerate() {
    if (!project.config.brandName?.trim()) {
      showToast("Configura il brand name nelle Settings prima di generare");
      return;
    }
    setGenerating(true);
    setGenerated([]);
    setSelected(new Set());
    try {
      const res = await fetch("/api/geo/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: project.config,
          count,
          focusIntent: focusIntent || undefined,
          focusFunnel: focusFunnel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Errore generazione"); return; }
      const prompts: GEOPrompt[] = (data.prompts || []).map(enrichPromptScores);
      setGenerated(prompts);
      setSelected(new Set(prompts.map((p) => p.id)));
      showToast(`${prompts.length} prompt generati`);
    } catch {
      showToast("Errore di rete");
    } finally {
      setGenerating(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleImport() {
    const toImport = generated.filter((p) => selected.has(p.id));
    if (toImport.length === 0) { showToast("Seleziona almeno un prompt"); return; }
    // Avoid duplicates by text
    const existingTexts = new Set(project.prompts.map((p) => p.text.toLowerCase().trim()));
    const newPrompts = toImport.filter((p) => !existingTexts.has(p.text.toLowerCase().trim()));
    if (newPrompts.length === 0) { showToast("Tutti i prompt selezionati esistono gia'"); return; }

    setProject((prev) => ({ ...prev, prompts: [...prev.prompts, ...newPrompts] }));
    setGenerated([]);
    setSelected(new Set());
    showToast(`${newPrompts.length} prompt importati`);
  }

  function updateGeneratedPrompt(id: string, patch: Partial<GEOPrompt>) {
    setGenerated((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Buyer Prompt Generator
        </div>
      </div>

      {/* Generator controls */}
      <div className="geo-gen-controls">
        <div className="geo-gen-row">
          <div>
            <label className="geo-label">Quanti prompt</label>
            <select className="geo-select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </div>
          <div>
            <label className="geo-label">Focus intent</label>
            <select className="geo-select" value={focusIntent} onChange={(e) => setFocusIntent(e.target.value)}>
              <option value="">Mix di tutti</option>
              {GEO_INTENTS.map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="geo-label">Focus funnel</label>
            <select className="geo-select" value={focusFunnel} onChange={(e) => setFocusFunnel(e.target.value)}>
              <option value="">Tutto il funnel</option>
              {GEO_FUNNELS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <button
          className={`geo-btn${showConfig ? " geo-btn-active" : ""}`}
          onClick={() => setShowConfig(!showConfig)}
        >
          Configura generazione
        </button>

        {showConfig && (
          <div className="sc-config" style={{ marginTop: 12 }}>
            <div className="sc-config-grid">
              <div className="sc-config-section">
                <div className="sc-config-label">Paese</div>
                <input className="sc-brand-input" value={project.config.country} onChange={(e) => updateConfig({ country: e.target.value })} />
              </div>
              <div className="sc-config-section">
                <div className="sc-config-label">Settore</div>
                <input className="sc-brand-input" value={project.config.industry} onChange={(e) => updateConfig({ industry: e.target.value })} placeholder="es: Digital Marketing" />
              </div>
              <ChipSection label="Buyer Personas" items={project.config.buyerPersonas} onChange={(v) => updateConfig({ buyerPersonas: v })} placeholder="es: CEO PMI" />
              <ChipSection label="Servizi" items={project.config.services} onChange={(v) => updateConfig({ services: v })} placeholder="es: Marketing strategy" />
              <ChipSection label="Problemi del cliente" items={project.config.problems} onChange={(v) => updateConfig({ problems: v })} placeholder="es: Lead generation" />
            </div>
          </div>
        )}

        <div className="geo-gen-config-summary">
          <strong>Brand:</strong> {project.config.brandName || "—"} |
          <strong> Personas:</strong> {project.config.buyerPersonas.join(", ") || "—"} |
          <strong> Servizi:</strong> {project.config.services.join(", ") || "—"} |
          <strong> Competitor:</strong> {project.config.competitors.join(", ") || "—"}
        </div>

        <button
          className="geo-btn geo-btn-accent geo-btn-lg"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generando..." : "Genera prompt con AI"}
        </button>
      </div>

      {/* Generated prompts */}
      {generated.length > 0 && (
        <div className="geo-gen-results">
          <div className="geo-gen-results-head">
            <span>{generated.length} prompt generati — {selected.size} selezionati</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="geo-btn" onClick={() => setSelected(new Set(generated.map((p) => p.id)))}>
                Seleziona tutti
              </button>
              <button className="geo-btn geo-btn-accent" onClick={handleImport}>
                Importa {selected.size} nel Prompt Monitor
              </button>
            </div>
          </div>

          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === generated.length}
                      onChange={() => setSelected(selected.size === generated.length ? new Set() : new Set(generated.map((p) => p.id)))}
                    />
                  </th>
                  <th>Prompt</th>
                  <th>Intent</th>
                  <th>Funnel</th>
                  <th>Persona</th>
                  <th>Valore</th>
                </tr>
              </thead>
              <tbody>
                {generated.map((p) => (
                  <tr key={p.id} className={`geo-row${selected.has(p.id) ? " geo-row-expanded" : ""}`}>
                    <td>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="geo-td-prompt">{p.text}</td>
                    <td>
                      <select className="geo-select-sm" value={p.intent} onChange={(e) => updateGeneratedPrompt(p.id, { intent: e.target.value as GEOIntent })}>
                        {GEO_INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="geo-select-sm" value={p.funnelStage} onChange={(e) => updateGeneratedPrompt(p.id, { funnelStage: e.target.value as GEOFunnel })}>
                        {GEO_FUNNELS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td className="geo-td-persona">{p.buyerPersona}</td>
                    <td className="geo-td-num">{p.commercialValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing prompts count */}
      <div className="geo-gen-existing">
        {project.prompts.length} prompt gia' nel Prompt Monitor
      </div>
    </div>
  );
}
