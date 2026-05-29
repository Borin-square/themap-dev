"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";

function TagInput({ items, onAdd, onRemove, placeholder }: {
  items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string;
}) {
  const [val, setVal] = useState("");
  function add() {
    const v = val.trim();
    if (v && !items.includes(v)) { onAdd(v); setVal(""); }
  }
  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {items.map((item) => (
            <span key={item} className="geo-tag" style={{ gap: 4, cursor: "pointer" }} onClick={() => onRemove(item)}>
              {item} {"\u2715"}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="geo-settings-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button className="geo-btn geo-btn-accent" onClick={add}>+</button>
      </div>
    </div>
  );
}

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

  const cfg = project.config;

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Settings
        </div>
      </div>

      {/* Brand & Dominio */}
      <div className="geo-settings-grid">
        <div className="geo-settings-section">
          <div className="geo-settings-label">Brand Name</div>
          <input
            className="geo-settings-input"
            value={cfg.brandName}
            onChange={(e) => updateConfig({ brandName: e.target.value })}
            placeholder="es: Square Marketing"
          />
        </div>
        <div className="geo-settings-section">
          <div className="geo-settings-label">Dominio</div>
          <input
            className="geo-settings-input"
            value={cfg.siteUrl}
            onChange={(e) => updateConfig({ siteUrl: e.target.value })}
            placeholder="https://example.com"
          />
        </div>
      </div>

      {/* Settore & Mercato */}
      <div className="geo-settings-grid">
        <div className="geo-settings-section">
          <div className="geo-settings-label">Settore / Industry</div>
          <input
            className="geo-settings-input"
            value={cfg.industry}
            onChange={(e) => updateConfig({ industry: e.target.value })}
            placeholder="es: Marketing digitale, SaaS, E-commerce"
          />
        </div>
        <div className="geo-settings-section">
          <div className="geo-settings-label">Mercato</div>
          <select
            className="geo-settings-input"
            value={cfg.market}
            onChange={(e) => updateConfig({ market: e.target.value })}
          >
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
            <option value="B2B2C">B2B2C</option>
          </select>
        </div>
      </div>

      {/* Paese & Lingua */}
      <div className="geo-settings-grid">
        <div className="geo-settings-section">
          <div className="geo-settings-label">Paese</div>
          <input
            className="geo-settings-input"
            value={cfg.country}
            onChange={(e) => updateConfig({ country: e.target.value })}
            placeholder="es: Italia"
          />
        </div>
        <div className="geo-settings-section">
          <div className="geo-settings-label">Lingua</div>
          <select
            className="geo-settings-input"
            value={cfg.language}
            onChange={(e) => updateConfig({ language: e.target.value })}
          >
            <option value="it">Italiano</option>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="fr">Francais</option>
            <option value="es">Espanol</option>
          </select>
        </div>
      </div>

      {/* Servizi */}
      <div className="geo-settings-block">
        <div className="geo-settings-label">Servizi</div>
        <TagInput
          items={cfg.services}
          onAdd={(v) => updateConfig({ services: [...cfg.services, v] })}
          onRemove={(v) => updateConfig({ services: cfg.services.filter((s) => s !== v) })}
          placeholder="Aggiungi servizio (es: SEO, Paid Ads, Web Design)"
        />
      </div>

      {/* Buyer Personas */}
      <div className="geo-settings-block">
        <div className="geo-settings-label">Buyer Personas</div>
        <TagInput
          items={cfg.buyerPersonas}
          onAdd={(v) => updateConfig({ buyerPersonas: [...cfg.buyerPersonas, v] })}
          onRemove={(v) => updateConfig({ buyerPersonas: cfg.buyerPersonas.filter((s) => s !== v) })}
          placeholder="Aggiungi persona (es: Marketing Manager, CEO PMI)"
        />
      </div>

      {/* Problemi del cliente */}
      <div className="geo-settings-block">
        <div className="geo-settings-label">Problemi del Cliente</div>
        <TagInput
          items={cfg.problems}
          onAdd={(v) => updateConfig({ problems: [...cfg.problems, v] })}
          onRemove={(v) => updateConfig({ problems: cfg.problems.filter((s) => s !== v) })}
          placeholder="Aggiungi problema (es: bassa visibilita' online, lead non qualificati)"
        />
      </div>

      {/* Competitors */}
      <div className="geo-settings-block">
        <div className="geo-settings-label">Competitors</div>

        {cfg.competitors.length > 0 && (
          <div className="geo-comp-list">
            {cfg.competitors.map((name) => (
              <div key={name} className="geo-comp-row">
                <span className="geo-comp-name">{name}</span>
                <input
                  className="geo-comp-domain"
                  value={(cfg.competitorDomains || {})[name] || ""}
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
