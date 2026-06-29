"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, GEOCompetitorMention } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { competitorRanking, competitorMentionRate, allCompetitorMentions, canonicalCompetitorName } from "@/lib/geo/scoring";

export default function CompetitorTrackerPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

  const ranking = useMemo(() => competitorRanking(project), [project]);
  const mentionRate = useMemo(() => competitorMentionRate(project), [project]);
  const allMentions = useMemo(() => allCompetitorMentions(project), [project]);

  const hasData = allMentions.length > 0;

  // Detail for selected competitor
  const detail = useMemo(() => {
    if (!selectedCompetitor) return null;
    const configured = project.config.competitors || [];
    const selectedKey = canonicalCompetitorName(selectedCompetitor, configured);
    const mentions = allMentions.filter((m) => canonicalCompetitorName(m.name, configured) === selectedKey);
    const allAttributes = mentions.flatMap((m) => m.attributes);
    const allStrengths = mentions.flatMap((m) => m.strengths);
    const allWeaknesses = mentions.flatMap((m) => m.weaknesses);
    const promptIds = new Set(mentions.map((m) => m.promptId));
    const prompts = project.prompts.filter((p) => promptIds.has(p.id));

    return {
      mentions: mentions.length,
      prompts,
      attributes: countUnique(allAttributes),
      strengths: countUnique(allStrengths),
      weaknesses: countUnique(allWeaknesses),
      sentiments: mentions.map((m) => m.sentiment),
    };
  }, [selectedCompetitor, allMentions, project.prompts, project.config.competitors]);

  return (
    <div className="geo-page">
      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Competitor Tracker
        </div>
      </div>

      {!hasData ? (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessun dato competitor</div>
          <p>Scansiona dei prompt nel Prompt Monitor per raccogliere le menzioni competitor.</p>
        </div>
      ) : (
        <>
          <div className="geo-kpi-grid">
            <div className="geo-kpi">
              <span className="geo-kpi-n">{mentionRate}%</span>
              <span className="geo-kpi-l">Competitor Mention Rate</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{ranking.length}</span>
              <span className="geo-kpi-l">Competitor unici</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{allMentions.length}</span>
              <span className="geo-kpi-l">Menzioni totali</span>
            </div>
          </div>

          <div className="geo-comp-layout">
            {/* Ranking table */}
            <div className="geo-comp-list">
              <div className="geo-section-title">Classifica competitor</div>
              <div className="geo-table-wrap">
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Competitor</th>
                      <th>Menzioni</th>
                      <th>Prompt</th>
                      <th>Sentiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((c, i) => (
                      <tr
                        key={c.name}
                        className={`geo-row${selectedCompetitor === c.name ? " geo-row-expanded" : ""}`}
                        onClick={() => setSelectedCompetitor(selectedCompetitor === c.name ? null : c.name)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="geo-td-num">{i + 1}</td>
                        <td><strong>{c.name}</strong></td>
                        <td className="geo-td-num">{c.mentions}</td>
                        <td className="geo-td-num">{c.promptCount}</td>
                        <td>
                          <span className={`geo-tag geo-tag-sent-${c.avgSentiment}`}>
                            {c.avgSentiment}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detail panel */}
            {detail && selectedCompetitor && (
              <div className="geo-comp-detail">
                <div className="geo-comp-detail-head">
                  <strong>{selectedCompetitor}</strong>
                  <button className="sc-sb-close" onClick={() => setSelectedCompetitor(null)}>{"\u2715"}</button>
                </div>

                <div className="geo-comp-section">
                  <div className="geo-comp-section-title">Attributi associati</div>
                  <div className="sc-chips">
                    {detail.attributes.map(([attr, count]) => (
                      <span key={attr} className="sc-chip">{attr} ({count})</span>
                    ))}
                    {detail.attributes.length === 0 && <span className="geo-na">Nessuno</span>}
                  </div>
                </div>

                <div className="geo-comp-section">
                  <div className="geo-comp-section-title">Punti di forza percepiti</div>
                  <div className="sc-chips">
                    {detail.strengths.map(([s, count]) => (
                      <span key={s} className="sc-chip" style={{ borderColor: "var(--grn)" }}>{s} ({count})</span>
                    ))}
                    {detail.strengths.length === 0 && <span className="geo-na">Nessuno</span>}
                  </div>
                </div>

                <div className="geo-comp-section">
                  <div className="geo-comp-section-title">Debolezze / spazi scoperti</div>
                  <div className="sc-chips">
                    {detail.weaknesses.map(([w, count]) => (
                      <span key={w} className="sc-chip" style={{ borderColor: "var(--org)" }}>{w} ({count})</span>
                    ))}
                    {detail.weaknesses.length === 0 && <span className="geo-na">Nessuna</span>}
                  </div>
                </div>

                <div className="geo-comp-section">
                  <div className="geo-comp-section-title">Prompt in cui compare</div>
                  <div className="geo-comp-prompts">
                    {detail.prompts.map((p) => (
                      <div key={p.id} className="geo-comp-prompt-item">{p.text}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
