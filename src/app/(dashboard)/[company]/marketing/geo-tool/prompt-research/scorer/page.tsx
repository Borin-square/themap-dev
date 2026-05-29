"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { GEO_TIER_LABELS } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import {
  enrichPromptScores, promptMentionRate, scoreColor,
} from "@/lib/geo/scoring";

export default function OpportunityScorerPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  // Recompute scores
  function handleRecalculate() {
    setProject((prev) => ({
      ...prev,
      prompts: prev.prompts.map(enrichPromptScores),
    }));
  }

  // Group by tier
  const tiers = useMemo(() => {
    const scored = project.prompts.map(enrichPromptScores);
    const groups = {
      quick_win: scored.filter((p) => p.priorityTier === "quick_win"),
      strategic_bet: scored.filter((p) => p.priorityTier === "strategic_bet"),
      long_term: scored.filter((p) => p.priorityTier === "long_term"),
      low_priority: scored.filter((p) => p.priorityTier === "low_priority"),
    };
    // Sort each group by opportunity score desc
    for (const key of Object.keys(groups) as Array<keyof typeof groups>) {
      groups[key].sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
    }
    return groups;
  }, [project.prompts]);

  const hasData = project.prompts.length > 0;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Opportunity Scorer
        </div>
        <button className="geo-btn" onClick={handleRecalculate}>Ricalcola score</button>
      </div>

      {!hasData ? (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessun prompt da valutare</div>
          <p>Aggiungi prompt nel Prompt Monitor o generali con il Prompt Generator.</p>
        </div>
      ) : (
        <div className="geo-scorer-grid">
          {(["quick_win", "strategic_bet", "long_term", "low_priority"] as const).map((tier) => (
            <div key={tier} className={`geo-scorer-col geo-scorer-${tier}`}>
              <div className="geo-scorer-col-head">
                <span className={`geo-scorer-tier-badge geo-scorer-tier-${tier}`}>
                  {GEO_TIER_LABELS[tier]}
                </span>
                <span className="geo-scorer-count">{tiers[tier].length}</span>
              </div>
              {tiers[tier].map((p) => {
                const mr = promptMentionRate(p);
                return (
                  <div key={p.id} className="geo-scorer-card">
                    <div className="geo-scorer-prompt">{p.text}</div>
                    <div className="geo-scorer-scores">
                      <div className="geo-scorer-score">
                        <span className="geo-scorer-score-n">{p.opportunityScore || 0}</span>
                        <span className="geo-scorer-score-l">Opportunity</span>
                      </div>
                      <div className="geo-scorer-score">
                        <span className="geo-scorer-score-n">{p.effortScore || 0}</span>
                        <span className="geo-scorer-score-l">Effort</span>
                      </div>
                      <div className="geo-scorer-score">
                        <span className="geo-scorer-score-n">{p.impactScore || 0}</span>
                        <span className="geo-scorer-score-l">Impact</span>
                      </div>
                    </div>
                    <div className="geo-scorer-meta">
                      <span className={`geo-tag geo-tag-${p.intent}`}>{p.intent}</span>
                      <span className="geo-tag">{p.funnelStage}</span>
                      {p.scans.length > 0 && (
                        <span className={`geo-c-${scoreColor(mr)}`}>{mr}% mention</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {tiers[tier].length === 0 && (
                <div className="geo-scorer-empty">Nessun prompt in questa categoria</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
