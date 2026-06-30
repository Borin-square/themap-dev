"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { competitorRanking, competitorMentionRate, allCompetitorMentions } from "@/lib/geo/scoring";

export default function CompetitorTrackerPage() {
  const params = useParams();
  const router = useRouter();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const ranking = useMemo(() => competitorRanking(project), [project]);
  const mentionRate = useMemo(() => competitorMentionRate(project), [project]);
  const allMentions = useMemo(() => allCompetitorMentions(project), [project]);

  const hasData = allMentions.length > 0;
  const base = `/${slug}/marketing/geo-tool/brand-report/competitor-tracker`;

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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((c, i) => (
                  <tr
                    key={c.name}
                    className="geo-row"
                    onClick={() => router.push(`${base}/${encodeURIComponent(c.name)}`)}
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
                    <td style={{ fontSize: 11, color: "var(--fg3)" }}>{"\u203A"}</td>
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
