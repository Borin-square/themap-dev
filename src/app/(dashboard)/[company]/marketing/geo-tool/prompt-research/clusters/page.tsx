"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, GEOIntentCluster, GEOIntent } from "@/lib/geo/types";
import { GEO_INTENTS, GEO_FUNNELS } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { promptMentionRate, scoreColor } from "@/lib/geo/scoring";

export default function IntentClustersPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const selectedCluster = useMemo(
    () => project.clusters.find((c) => c.id === selectedClusterId) || null,
    [project.clusters, selectedClusterId],
  );

  // Prompts in selected cluster
  const clusterPrompts = useMemo(() => {
    if (!selectedCluster) return [];
    return project.prompts.filter((p) => selectedCluster.promptIds.includes(p.id));
  }, [selectedCluster, project.prompts]);

  // Unassigned prompts
  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of project.clusters) for (const id of c.promptIds) set.add(id);
    return set;
  }, [project.clusters]);

  const unassigned = useMemo(
    () => project.prompts.filter((p) => !assignedIds.has(p.id)),
    [project.prompts, assignedIds],
  );

  function handleAddCluster() {
    const c: GEOIntentCluster = {
      id: crypto.randomUUID(), name: "Nuovo cluster", description: "",
      mainIntent: "informativo", subIntents: [], buyerPersona: "",
      maturityLevel: "awareness", promptIds: [],
    };
    setProject((prev) => ({ ...prev, clusters: [...prev.clusters, c] }));
    setSelectedClusterId(c.id);
    showToast("Cluster creato");
  }

  function handleDeleteCluster(id: string) {
    setProject((prev) => ({ ...prev, clusters: prev.clusters.filter((c) => c.id !== id) }));
    if (selectedClusterId === id) setSelectedClusterId(null);
    setConfirmDel(null);
    showToast("Cluster eliminato");
  }

  function updateCluster(id: string, patch: Partial<GEOIntentCluster>) {
    setProject((prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) => c.id === id ? { ...c, ...patch } : c),
    }));
  }

  function addPromptToCluster(promptId: string) {
    if (!selectedClusterId) return;
    updateCluster(selectedClusterId, {
      promptIds: [...(selectedCluster?.promptIds || []), promptId],
    });
    // Also set clusterId on the prompt
    setProject((prev) => ({
      ...prev,
      prompts: prev.prompts.map((p) => p.id === promptId ? { ...p, clusterId: selectedClusterId } : p),
    }));
  }

  function removePromptFromCluster(promptId: string) {
    if (!selectedClusterId || !selectedCluster) return;
    updateCluster(selectedClusterId, {
      promptIds: selectedCluster.promptIds.filter((id) => id !== promptId),
    });
    setProject((prev) => ({
      ...prev,
      prompts: prev.prompts.map((p) => p.id === promptId ? { ...p, clusterId: undefined } : p),
    }));
  }

  // Cluster stats
  function clusterMentionRate(c: GEOIntentCluster): number {
    const prompts = project.prompts.filter((p) => c.promptIds.includes(p.id));
    if (prompts.length === 0) return 0;
    const rates = prompts.map(promptMentionRate);
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  }

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Intent Cluster Builder
        </div>
        <button className="geo-btn geo-btn-accent" onClick={handleAddCluster}>+ Cluster</button>
      </div>

      <div className="geo-cluster-layout">
        {/* Cluster list */}
        <div className="geo-cluster-list">
          {project.clusters.length === 0 ? (
            <div className="geo-empty">Nessun cluster. Creane uno per raggruppare i prompt per intento.</div>
          ) : (
            project.clusters.map((c) => {
              const mr = clusterMentionRate(c);
              return (
                <div
                  key={c.id}
                  className={`geo-cluster-card${selectedClusterId === c.id ? " geo-cluster-sel" : ""}`}
                  onClick={() => setSelectedClusterId(selectedClusterId === c.id ? null : c.id)}
                >
                  <div className="geo-cluster-card-head">
                    <strong>{c.name}</strong>
                    <span className="geo-tag">{c.mainIntent}</span>
                    <span className="geo-tag">{c.maturityLevel}</span>
                  </div>
                  {c.description && <div className="geo-cluster-desc">{c.description}</div>}
                  <div className="geo-cluster-stats">
                    <span>{c.promptIds.length} prompt</span>
                    {c.promptIds.length > 0 && (
                      <span className={`geo-c-${scoreColor(mr)}`}>{mr}% mention rate</span>
                    )}
                  </div>
                  <div className="geo-cluster-actions" onClick={(e) => e.stopPropagation()}>
                    {confirmDel === c.id ? (
                      <span className="fws-confirm">
                        <button className="fws-confirm-yes" onClick={() => handleDeleteCluster(c.id)}>Si</button>
                        <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                      </span>
                    ) : (
                      <button className="comp-del" onClick={() => setConfirmDel(c.id)}>{"\u2715"}</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cluster detail + unassigned */}
        {selectedCluster && (
          <div className="geo-cluster-detail">
            <div className="geo-cluster-detail-head">
              <span>Dettaglio cluster</span>
              <button className="sc-sb-close" onClick={() => setSelectedClusterId(null)}>{"\u2715"}</button>
            </div>

            <div className="geo-cluster-form">
              <label className="geo-label">Nome</label>
              <input value={selectedCluster.name} onChange={(e) => updateCluster(selectedCluster.id, { name: e.target.value })} />

              <label className="geo-label">Descrizione</label>
              <textarea value={selectedCluster.description} onChange={(e) => updateCluster(selectedCluster.id, { description: e.target.value })} rows={2} />

              <div className="geo-cluster-form-row">
                <div>
                  <label className="geo-label">Intent</label>
                  <select value={selectedCluster.mainIntent} onChange={(e) => updateCluster(selectedCluster.id, { mainIntent: e.target.value as GEOIntent })}>
                    {GEO_INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="geo-label">Maturita</label>
                  <select value={selectedCluster.maturityLevel} onChange={(e) => updateCluster(selectedCluster.id, { maturityLevel: e.target.value as "awareness" | "consideration" | "decision" })}>
                    <option value="awareness">Awareness</option>
                    <option value="consideration">Consideration</option>
                    <option value="decision">Decision</option>
                  </select>
                </div>
                <div>
                  <label className="geo-label">Buyer persona</label>
                  <input value={selectedCluster.buyerPersona} onChange={(e) => updateCluster(selectedCluster.id, { buyerPersona: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Prompts in cluster */}
            <div className="geo-section-title">Prompt nel cluster ({clusterPrompts.length})</div>
            {clusterPrompts.map((p) => (
              <div key={p.id} className="geo-cluster-prompt">
                <span>{p.text}</span>
                <button className="comp-del" onClick={() => removePromptFromCluster(p.id)}>{"\u2715"}</button>
              </div>
            ))}

            {/* Unassigned prompts */}
            {unassigned.length > 0 && (
              <>
                <div className="geo-section-title">Prompt non assegnati ({unassigned.length})</div>
                {unassigned.map((p) => (
                  <div key={p.id} className="geo-cluster-prompt geo-cluster-prompt-add">
                    <span>{p.text}</span>
                    <button className="geo-btn-small" onClick={() => addPromptToCluster(p.id)}>+</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
