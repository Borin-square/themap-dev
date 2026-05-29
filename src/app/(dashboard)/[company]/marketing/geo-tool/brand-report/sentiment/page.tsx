"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, GEOScan } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { avgSentimentScore, scoreColor } from "@/lib/geo/scoring";

export default function SentimentPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const scansWithMention = useMemo(() => {
    return project.prompts.flatMap((p) =>
      p.scans.filter((s) => s.brandMentioned).map((s) => ({ ...s, promptText: p.text }))
    );
  }, [project]);

  const sentimentScore = useMemo(() => avgSentimentScore(project), [project]);

  const phrases = useMemo(() => {
    const all = scansWithMention.flatMap((s) => s.sentiment.phrases);
    return countUnique(all).slice(0, 20);
  }, [scansWithMention]);

  const strengths = useMemo(() => {
    const all = scansWithMention.flatMap((s) => s.sentiment.strengths);
    return countUnique(all);
  }, [scansWithMention]);

  const weaknesses = useMemo(() => {
    const all = scansWithMention.flatMap((s) => s.sentiment.weaknesses);
    return countUnique(all);
  }, [scansWithMention]);

  const attributes = useMemo(() => {
    const all = scansWithMention.flatMap((s) => s.brandAttributes);
    return countUnique(all);
  }, [scansWithMention]);

  const avgAlignment = useMemo(() => {
    if (scansWithMention.length === 0) return 0;
    return Math.round(scansWithMention.reduce((a, s) => a + s.sentiment.alignmentScore, 0) / scansWithMention.length);
  }, [scansWithMention]);

  const sentimentByLlm = useMemo(() => {
    const map = new Map<string, { scores: number[]; labels: string[] }>();
    for (const s of scansWithMention) {
      if (!map.has(s.llm)) map.set(s.llm, { scores: [], labels: [] });
      const entry = map.get(s.llm)!;
      entry.scores.push(s.sentiment.score);
      entry.labels.push(s.sentiment.label);
    }
    return Array.from(map.entries()).map(([llm, data]) => ({
      llm,
      avg: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length * 100) / 100,
      count: data.scores.length,
    }));
  }, [scansWithMention]);

  const hasData = scansWithMention.length > 0;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Brand Sentiment Analyzer
        </div>
      </div>

      {!hasData ? (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessun dato sentiment</div>
          <p>Il brand deve essere menzionato in almeno uno scan per analizzare il sentiment.</p>
        </div>
      ) : (
        <>
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(sentimentScore)}`}>{sentimentScore}/100</span>
              <span className="geo-kpi-l">Sentiment Score</span>
            </div>
            <div className="geo-kpi">
              <span className={`geo-kpi-n geo-c-${scoreColor(avgAlignment)}`}>{avgAlignment}%</span>
              <span className="geo-kpi-l">Positioning Alignment</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{scansWithMention.length}</span>
              <span className="geo-kpi-l">Menzioni analizzate</span>
            </div>
          </div>

          {/* Sentiment per LLM */}
          <div className="geo-section-title">Sentiment per LLM</div>
          <div className="geo-sent-llm-grid">
            {sentimentByLlm.map((l) => (
              <div key={l.llm} className="geo-sent-llm-card">
                <div className="geo-sent-llm-name">{l.llm}</div>
                <div className={`geo-sent-llm-score geo-c-${l.avg > 0.3 ? "grn" : l.avg < -0.3 ? "red" : "org"}`}>
                  {l.avg > 0 ? "+" : ""}{l.avg}
                </div>
                <div className="geo-sent-llm-count">{l.count} menzioni</div>
              </div>
            ))}
          </div>

          <div className="geo-sent-columns">
            {/* Strengths */}
            <div className="geo-sent-col">
              <div className="geo-section-title" style={{ color: "var(--grn)" }}>Punti di forza</div>
              {strengths.map(([s, count]) => (
                <div key={s} className="geo-sent-item geo-sent-strength">
                  <span>{s}</span>
                  <span className="geo-sent-count">{count}</span>
                </div>
              ))}
              {strengths.length === 0 && <span className="geo-na">Nessuno rilevato</span>}
            </div>

            {/* Weaknesses */}
            <div className="geo-sent-col">
              <div className="geo-section-title" style={{ color: "var(--red)" }}>Punti deboli</div>
              {weaknesses.map(([w, count]) => (
                <div key={w} className="geo-sent-item geo-sent-weakness">
                  <span>{w}</span>
                  <span className="geo-sent-count">{count}</span>
                </div>
              ))}
              {weaknesses.length === 0 && <span className="geo-na">Nessuno rilevato</span>}
            </div>

            {/* Attributes */}
            <div className="geo-sent-col">
              <div className="geo-section-title">Attributi usati</div>
              <div className="sc-chips" style={{ gap: 6 }}>
                {attributes.map(([a, count]) => (
                  <span key={a} className="sc-chip">{a} ({count})</span>
                ))}
              </div>
              {attributes.length === 0 && <span className="geo-na">Nessuno</span>}
            </div>
          </div>

          {/* Key phrases */}
          {phrases.length > 0 && (
            <>
              <div className="geo-section-title">Frasi ricorrenti</div>
              <div className="geo-phrases">
                {phrases.map(([p, count]) => (
                  <blockquote key={p} className="geo-phrase">
                    &ldquo;{p}&rdquo;
                    <span className="geo-phrase-count">{count}x</span>
                  </blockquote>
                ))}
              </div>
            </>
          )}
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
