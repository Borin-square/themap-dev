"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { allCompetitorMentions, canonicalCompetitorName } from "@/lib/geo/scoring";

export default function CompetitorDetailPage() {
  const params = useParams();
  const slug = params.company as string;
  const competitorParam = decodeURIComponent(params.competitor as string);

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const configured = project.config.competitors || [];
  const selectedKey = canonicalCompetitorName(competitorParam, configured);

  const data = useMemo(() => {
    const allMentions = allCompetitorMentions(project);
    const mentions = allMentions.filter((m) => canonicalCompetitorName(m.name, configured) === selectedKey);
    const allAttributes = mentions.flatMap((m) => m.attributes);
    const allStrengths = mentions.flatMap((m) => m.strengths);
    const allWeaknesses = mentions.flatMap((m) => m.weaknesses);
    const promptIds = new Set(mentions.map((m) => m.promptId));
    const prompts = project.prompts.filter((p) => promptIds.has(p.id));

    const llmCounts = new Map<string, number>();
    for (const m of mentions) llmCounts.set(m.llm, (llmCounts.get(m.llm) || 0) + 1);

    const sentimentCounts = { positivo: 0, neutro: 0, negativo: 0 };
    for (const m of mentions) {
      const s = (m.sentiment as keyof typeof sentimentCounts) || "neutro";
      if (s in sentimentCounts) sentimentCounts[s]++;
    }

    const positions = mentions.map((m) => m.position).filter((p): p is number => typeof p === "number" && p > 0);
    const avgPosition = positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null;

    // Citations that reference this competitor name (best effort via competitorMentioned field)
    const citations = project.prompts.flatMap((p) =>
      p.scans.flatMap((s) =>
        s.citations
          .filter((c) => c.competitorMentioned && canonicalCompetitorName(c.competitorMentioned, configured) === selectedKey)
          .map((c) => ({ ...c, promptText: p.text, llm: s.llm })),
      ),
    );

    return {
      mentions: mentions.length,
      avgPosition,
      prompts,
      attributes: countUnique(allAttributes),
      strengths: countUnique(allStrengths),
      weaknesses: countUnique(allWeaknesses),
      sentimentCounts,
      llmCounts: Array.from(llmCounts.entries()).sort((a, b) => b[1] - a[1]),
      citations,
    };
  }, [project, configured, selectedKey]);

  const backHref = `/${slug}/marketing/geo-tool/brand-report/competitor-tracker`;

  // Display name: configured match, else first non-empty mention name occurrence
  const displayName = useMemo(() => {
    const cfgMatch = configured.find((c) => canonicalCompetitorName(c, configured) === selectedKey);
    if (cfgMatch) return cfgMatch;
    const allMentions = allCompetitorMentions(project);
    const first = allMentions.find((m) => canonicalCompetitorName(m.name, configured) === selectedKey);
    return first?.name || competitorParam;
  }, [project, configured, selectedKey, competitorParam]);

  if (data.mentions === 0) {
    return (
      <div className="geo-page">
        <div style={{ marginBottom: 12 }}>
          <Link href={backHref} className="geo-btn">{"\u2190 Tutti i competitor"}</Link>
        </div>
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna menzione</div>
          Nessuno scan contiene menzioni per &ldquo;{displayName}&rdquo;.
        </div>
      </div>
    );
  }

  return (
    <div className="geo-page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Link href={backHref} className="geo-btn">{"\u2190 Tutti i competitor"}</Link>
        <div style={{ fontSize: 11, color: "var(--fg3)" }}>
          {data.prompts.length} prompt &middot; {data.mentions} menzioni totali
        </div>
      </div>

      <div className="geo-head">
        <div className="geo-title">{displayName}</div>
      </div>

      {/* KPIs */}
      <div className="geo-kpi-grid">
        <div className="geo-kpi geo-kpi-big">
          <span className="geo-kpi-n">{data.mentions}</span>
          <span className="geo-kpi-l">Menzioni totali</span>
        </div>
        <div className="geo-kpi">
          <span className="geo-kpi-n">{data.prompts.length}</span>
          <span className="geo-kpi-l">Prompt in cui compare</span>
        </div>
        <div className="geo-kpi">
          <span className="geo-kpi-n">
            {data.avgPosition != null ? `#${data.avgPosition}` : "—"}
          </span>
          <span className="geo-kpi-l">Posizione media</span>
        </div>
        <div className="geo-kpi">
          <span className="geo-kpi-n geo-c-grn">{data.sentimentCounts.positivo}</span>
          <span className="geo-kpi-l">Menzioni positive</span>
        </div>
        <div className="geo-kpi">
          <span className="geo-kpi-n geo-c-org">{data.sentimentCounts.neutro}</span>
          <span className="geo-kpi-l">Menzioni neutre</span>
        </div>
        <div className="geo-kpi">
          <span className="geo-kpi-n geo-c-red">{data.sentimentCounts.negativo}</span>
          <span className="geo-kpi-l">Menzioni negative</span>
        </div>
      </div>

      {/* Per LLM */}
      <div className="geo-section-title">Menzioni per LLM</div>
      <div className="sc-chips" style={{ marginBottom: 16 }}>
        {data.llmCounts.map(([llm, count]) => (
          <span key={llm} className="sc-chip">{llm} ({count})</span>
        ))}
      </div>

      {/* Attributes / strengths / weaknesses */}
      <div className="geo-section-title">Attributi associati ({data.attributes.length})</div>
      <div className="sc-chips" style={{ marginBottom: 16 }}>
        {data.attributes.length === 0 && <span className="geo-na">Nessuno</span>}
        {data.attributes.map(([attr, count]) => (
          <span key={attr} className="sc-chip">{attr} ({count})</span>
        ))}
      </div>

      <div className="geo-section-title">Punti di forza percepiti ({data.strengths.length})</div>
      <div className="sc-chips" style={{ marginBottom: 16 }}>
        {data.strengths.length === 0 && <span className="geo-na">Nessuno</span>}
        {data.strengths.map(([s, count]) => (
          <span key={s} className="sc-chip" style={{ borderColor: "var(--grn)" }}>{s} ({count})</span>
        ))}
      </div>

      <div className="geo-section-title">Debolezze / spazi scoperti ({data.weaknesses.length})</div>
      <div className="sc-chips" style={{ marginBottom: 16 }}>
        {data.weaknesses.length === 0 && <span className="geo-na">Nessuna</span>}
        {data.weaknesses.map(([w, count]) => (
          <span key={w} className="sc-chip" style={{ borderColor: "var(--org)" }}>{w} ({count})</span>
        ))}
      </div>

      {/* Prompts */}
      <div className="geo-section-title">Prompt in cui compare ({data.prompts.length})</div>
      <div className="geo-comp-prompts" style={{ marginBottom: 16 }}>
        {data.prompts.map((p) => (
          <Link
            key={p.id}
            href={`/${slug}/marketing/geo-tool/brand-report/prompt-monitor`}
            className="geo-comp-prompt-item"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            {p.text}
          </Link>
        ))}
      </div>

      {/* Citations */}
      {data.citations.length > 0 && (
        <>
          <div className="geo-section-title">Citazioni che menzionano il competitor ({data.citations.length})</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Dominio</th>
                  <th>Titolo</th>
                  <th>LLM</th>
                </tr>
              </thead>
              <tbody>
                {data.citations.map((c, i) => (
                  <tr key={i} className="geo-row">
                    <td>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                          {c.domain}
                        </a>
                      ) : c.domain}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--fg2)" }}>{c.title || "-"}</td>
                    <td style={{ fontSize: 11, color: "var(--fg3)" }}>{c.llm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function countUnique(arr: string[]): [string, number][] {
  const map = new Map<string, number>();
  for (const v of arr) if (v) map.set(v, (map.get(v) || 0) + 1);
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}
