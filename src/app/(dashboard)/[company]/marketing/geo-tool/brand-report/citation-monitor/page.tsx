"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { GEO_SOURCE_LABELS } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { citationRanking, citationShareOwned, scoreColor } from "@/lib/geo/scoring";

export default function CitationMonitorPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const citations = useMemo(() => citationRanking(project), [project]);
  const ownedShare = useMemo(() => citationShareOwned(project), [project]);

  const allCites = useMemo(() => {
    return project.prompts.flatMap((p) => p.scans.flatMap((s) => s.citations));
  }, [project]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of allCites) map.set(c.type, (map.get(c.type) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [allCites]);

  const hasData = allCites.length > 0;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Citation Monitor
        </div>
      </div>

      {!hasData ? (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna citazione raccolta</div>
          <p>Scansiona dei prompt nel Prompt Monitor per raccogliere le citazioni dagli LLM.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="geo-kpi-grid">
            <div className="geo-kpi">
              <span className="geo-kpi-n">{allCites.length}</span>
              <span className="geo-kpi-l">Citazioni totali</span>
            </div>
            <div className="geo-kpi">
              <span className={`geo-kpi-n geo-c-${scoreColor(ownedShare)}`}>{ownedShare}%</span>
              <span className="geo-kpi-l">Citation Share (owned)</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{citations.length}</span>
              <span className="geo-kpi-l">Fonti uniche</span>
            </div>
          </div>

          {/* Source type breakdown */}
          <div className="geo-section-title">Fonti per tipo</div>
          <div className="geo-type-bar">
            {byType.map(([type, count]) => (
              <div key={type} className="geo-type-item">
                <span className={`geo-tag geo-tag-src-${type}`}>
                  {GEO_SOURCE_LABELS[type as keyof typeof GEO_SOURCE_LABELS] || type}
                </span>
                <span className="geo-type-count">{count}</span>
              </div>
            ))}
          </div>

          {/* Citation Table */}
          <div className="geo-section-title">Fonti citate dagli LLM</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Dominio / URL</th>
                  <th>Tipo</th>
                  <th>Citazioni</th>
                  <th>Prompt</th>
                  <th>Brand</th>
                </tr>
              </thead>
              <tbody>
                {citations.map((c, i) => (
                  <tr key={i} className="geo-row">
                    <td>
                      <div className="geo-cite-domain">{c.domain}</div>
                      {c.title && <div className="geo-cite-title">{c.title}</div>}
                      {c.url && c.url !== c.domain && <div className="geo-cite-url">{c.url}</div>}
                    </td>
                    <td>
                      <span className={`geo-tag geo-tag-src-${c.type}`}>
                        {GEO_SOURCE_LABELS[c.type as keyof typeof GEO_SOURCE_LABELS] || c.type}
                      </span>
                    </td>
                    <td className="geo-td-num">{c.count}</td>
                    <td className="geo-td-num">{c.promptCount}</td>
                    <td>
                      {c.brandMentioned ? (
                        <span className="geo-tag geo-tag-yes">Si</span>
                      ) : (
                        <span className="geo-tag geo-tag-no">No</span>
                      )}
                    </td>
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
