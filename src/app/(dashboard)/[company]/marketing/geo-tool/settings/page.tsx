"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";

export default function GEOSettingsPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [toast, setToast] = useState<string | null>(null);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [newCompDomain, setNewCompDomain] = useState("");

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function updateConfig(patch: Partial<GEOProject["config"]>) {
    setProject((prev) => ({ ...prev, config: { ...prev.config, ...patch } }));
  }

  function addCompetitor() {
    const name = newCompetitor.trim();
    if (!name) return;
    if (project.config.competitors.includes(name)) { showToast("Competitor gia' presente"); return; }
    const domain = newCompDomain.trim();
    const domains = { ...project.config.competitorDomains || {} };
    if (domain) domains[name] = domain;
    updateConfig({
      competitors: [...project.config.competitors, name],
      competitorDomains: domains,
    });
    setNewCompetitor("");
    setNewCompDomain("");
  }

  function removeCompetitor(name: string) {
    const domains = { ...project.config.competitorDomains || {} };
    delete domains[name];
    updateConfig({
      competitors: project.config.competitors.filter((c) => c !== name),
      competitorDomains: domains,
    });
  }

  function updateCompetitorDomain(name: string, domain: string) {
    const domains = { ...project.config.competitorDomains || {} };
    if (domain.trim()) domains[name] = domain.trim();
    else delete domains[name];
    updateConfig({ competitorDomains: domains });
  }

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Settings
        </div>
      </div>

      <div className="geo-settings-grid">
        {/* Brand */}
        <div className="geo-settings-section">
          <div className="geo-settings-label">Brand Name</div>
          <input
            className="geo-settings-input"
            value={project.config.brandName}
            onChange={(e) => updateConfig({ brandName: e.target.value })}
            placeholder="es: Square Marketing"
          />
        </div>

        {/* Dominio */}
        <div className="geo-settings-section">
          <div className="geo-settings-label">Dominio</div>
          <input
            className="geo-settings-input"
            value={project.config.siteUrl}
            onChange={(e) => updateConfig({ siteUrl: e.target.value })}
            placeholder="https://example.com"
          />
        </div>
      </div>

      {/* Competitors */}
      <div className="geo-settings-block">
        <div className="geo-settings-label">Competitors</div>

        {project.config.competitors.length > 0 && (
          <div className="geo-comp-list">
            {project.config.competitors.map((name) => (
              <div key={name} className="geo-comp-row">
                <span className="geo-comp-name">{name}</span>
                <input
                  className="geo-comp-domain"
                  value={(project.config.competitorDomains || {})[name] || ""}
                  onChange={(e) => updateCompetitorDomain(name, e.target.value)}
                  placeholder="dominio (es: hubspot.com)"
                />
                <button className="comp-del" onClick={() => removeCompetitor(name)}>{"\u2715"}</button>
              </div>
            ))}
          </div>
        )}

        <div className="geo-comp-add">
          <input
            className="geo-comp-add-input"
            value={newCompetitor}
            onChange={(e) => setNewCompetitor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
            placeholder="Nome competitor"
          />
          <input
            className="geo-comp-add-input"
            value={newCompDomain}
            onChange={(e) => setNewCompDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
            placeholder="Dominio (opzionale)"
          />
          <button className="geo-btn geo-btn-accent" onClick={addCompetitor}>Aggiungi</button>
        </div>
      </div>
    </div>
  );
}
