"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import {
  aiVisibilityScore, promptCoverageScore, brandMentionRate,
  competitorMentionRate, citationShareOwned, avgSentimentScore,
  avgOpportunityScore, scoreColor,
} from "@/lib/geo/scoring";

/* ── Time-series helpers ── */

interface TimePoint {
  date: string;        // YYYY-MM-DD
  visibility: number;
  brandMention: number;
}

function buildTimeSeries(project: GEOProject): TimePoint[] {
  // Collect all scans with dates
  const scanEntries: { date: string; promptIdx: number; scan: (typeof project.prompts)[0]["scans"][0] }[] = [];
  project.prompts.forEach((p, pi) => {
    p.scans.forEach((s) => {
      scanEntries.push({ date: s.scannedAt.slice(0, 10), promptIdx: pi, scan: s });
    });
  });
  if (scanEntries.length === 0) return [];

  // Sort by date
  scanEntries.sort((a, b) => a.date.localeCompare(b.date));

  // Get unique dates
  const dates = [...new Set(scanEntries.map((e) => e.date))];

  // For each date, compute cumulative KPIs (all scans up to that date)
  const points: TimePoint[] = [];
  for (const date of dates) {
    const scansUpToDate = scanEntries.filter((e) => e.date <= date);
    const totalScans = scansUpToDate.length;
    const mentioned = scansUpToDate.filter((e) => e.scan.brandMentioned).length;
    const brandMent = totalScans > 0 ? Math.round((mentioned / totalScans) * 100) : 0;

    // Simplified visibility: brand mention rate weighted with position
    const withPosition = scansUpToDate.filter((e) => e.scan.brandMentioned && e.scan.brandPosition);
    const avgPos = withPosition.length > 0
      ? withPosition.reduce((a, e) => a + (e.scan.brandPosition || 0), 0) / withPosition.length
      : 0;
    const posScore = withPosition.length > 0 ? Math.max(0, 100 - avgPos * 10) : 0;

    const withSentiment = scansUpToDate.filter((e) => e.scan.brandMentioned);
    const avgSent = withSentiment.length > 0
      ? withSentiment.reduce((a, e) => a + e.scan.sentiment.score, 0) / withSentiment.length
      : 0;
    const sentScore = (avgSent + 1) * 50;

    const visibility = Math.round(brandMent * 0.5 + posScore * 0.3 + sentScore * 0.2);
    points.push({ date, visibility, brandMention: brandMent });
  }
  return points;
}

/* ── SVG Line Chart ── */

function SparkChart({ data, dataKey, color, width = 480, height = 160 }: {
  data: TimePoint[];
  dataKey: keyof TimePoint;
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const padX = 40;
  const padY = 20;
  const padR = 12;
  const padB = 28;
  const w = width - padX - padR;
  const h = height - padY - padB;

  const values = data.map((d) => d[dataKey] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * w;
    const y = padY + h - ((d[dataKey] as number) - min) / range * h;
    return { x, y, d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padY + h} L${points[0].x},${padY + h} Z`;

  // Y-axis ticks
  const ticks = [min, Math.round((min + max) / 2), max];
  // X-axis labels (first, middle, last)
  const xLabels = [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]];
  const xPositions = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="geo-chart-svg">
      <defs>
        <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {ticks.map((t) => {
        const y = padY + h - ((t - min) / range) * h;
        return (
          <g key={t}>
            <line x1={padX} x2={padX + w} y1={y} y2={y} stroke="var(--bd)" strokeDasharray="3,3" />
            <text x={padX - 6} y={y + 4} textAnchor="end" fill="var(--fg3)" fontSize="10">{t}%</text>
          </g>
        );
      })}
      {/* Area */}
      <path d={areaPath} fill={`url(#grad-${dataKey})`} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="var(--bg2)" strokeWidth="1.5" />
      ))}
      {/* X labels */}
      {xPositions.map((idx, i) => (
        <text key={i} x={points[idx].x} y={padY + h + 16} textAnchor="middle" fill="var(--fg3)" fontSize="9">
          {xLabels[i].date.slice(5).replace("-", "/")}
        </text>
      ))}
    </svg>
  );
}

/* ── Dashboard ── */

export default function GEODashboard() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const kpis = useMemo(() => {
    const scannedPrompts = project.prompts.filter((p) => p.scans.length > 0);
    const totalScans = project.prompts.reduce((a, p) => a + p.scans.length, 0);
    return {
      visibility: aiVisibilityScore(project),
      coverage: promptCoverageScore(project),
      brandMention: brandMentionRate(project),
      competitorMention: competitorMentionRate(project),
      citationOwned: citationShareOwned(project),
      sentiment: avgSentimentScore(project),
      opportunity: avgOpportunityScore(project),
      totalPrompts: project.prompts.length,
      scannedPrompts: scannedPrompts.length,
      totalScans,
      clusters: project.clusters.length,
    };
  }, [project]);

  const timeSeries = useMemo(() => buildTimeSeries(project), [project]);

  const base = `/${slug}/marketing/geo-tool`;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {company?.name || slug} — GEO Dashboard
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="geo-hero-row">
        <div className="geo-hero-card">
          <span className="geo-hero-label">AI Visibility</span>
          <span className={`geo-hero-value geo-c-${scoreColor(kpis.visibility)}`}>
            {kpis.visibility}<span className="geo-hero-suffix">%</span>
          </span>
          <span className="geo-hero-sub">
            {kpis.scannedPrompts}/{kpis.totalPrompts} prompt scansionati
          </span>
        </div>
        <div className="geo-hero-card">
          <span className="geo-hero-label">Brand Mention Rate</span>
          <span className={`geo-hero-value geo-c-${scoreColor(kpis.brandMention)}`}>
            {kpis.brandMention}<span className="geo-hero-suffix">%</span>
          </span>
          <span className="geo-hero-sub">
            su {kpis.totalScans} scansioni totali
          </span>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="geo-sec-row">
        <SecKPI label="Prompt Coverage" value={kpis.coverage} suffix="%" color={scoreColor(kpis.coverage)} />
        <SecKPI label="Competitor Mention" value={kpis.competitorMention} suffix="%"
          color={kpis.competitorMention > 50 ? "red" : kpis.competitorMention > 25 ? "org" : "grn"} />
        <SecKPI label="Owned Citations" value={kpis.citationOwned} suffix="%" color={scoreColor(kpis.citationOwned)} />
        <SecKPI label="Sentiment" value={kpis.sentiment} suffix="/100" color={scoreColor(kpis.sentiment)} />
        <SecKPI label="Opportunity" value={kpis.opportunity} suffix="/100" color={scoreColor(kpis.opportunity)} />
      </div>

      {/* Chart */}
      {timeSeries.length >= 2 && (
        <div className="geo-chart-card">
          <div className="geo-chart-head">AI Visibility nel tempo</div>
          <SparkChart data={timeSeries} dataKey="visibility" color="var(--accent)" />
        </div>
      )}
      {timeSeries.length < 2 && kpis.totalScans > 0 && (
        <div className="geo-chart-card geo-chart-empty">
          <div className="geo-chart-head">AI Visibility nel tempo</div>
          <span className="geo-chart-hint">Servono scan in almeno 2 date diverse per generare il grafico</span>
        </div>
      )}

      {/* Status cards */}
      <div className="geo-status-grid">
        <div className="geo-status-card">
          <div className="geo-status-head">
            <span className="geo-status-icon">{"\u25B6"}</span>
            Prompt Monitor
          </div>
          <div className="geo-status-body">
            <div className="geo-status-metric">
              <span className="geo-status-n">{kpis.totalPrompts}</span>
              <span className="geo-status-l">Prompt monitorati</span>
            </div>
            <div className="geo-status-metric">
              <span className="geo-status-n">{kpis.scannedPrompts}</span>
              <span className="geo-status-l">Con almeno 1 scan</span>
            </div>
            <div className="geo-status-metric">
              <span className="geo-status-n">{kpis.totalScans}</span>
              <span className="geo-status-l">Scansioni totali</span>
            </div>
          </div>
          <Link href={`${base}/brand-report/prompt-monitor`} className="geo-status-link">Apri Prompt Monitor →</Link>
        </div>

        <div className="geo-status-card">
          <div className="geo-status-head">
            <span className="geo-status-icon">{"\u2693"}</span>
            Citation Monitor
          </div>
          <div className="geo-status-body">
            <div className="geo-status-metric">
              <span className="geo-status-n">{kpis.citationOwned}%</span>
              <span className="geo-status-l">Citazioni proprietarie</span>
            </div>
          </div>
          <Link href={`${base}/brand-report/citation-monitor`} className="geo-status-link">Apri Citation Monitor →</Link>
        </div>

        <div className="geo-status-card">
          <div className="geo-status-head">
            <span className="geo-status-icon">{"\u2694"}</span>
            Competitor Tracker
          </div>
          <div className="geo-status-body">
            <div className="geo-status-metric">
              <span className="geo-status-n">{kpis.competitorMention}%</span>
              <span className="geo-status-l">Menzioni competitor</span>
            </div>
          </div>
          <Link href={`${base}/brand-report/competitor-tracker`} className="geo-status-link">Apri Competitor Tracker →</Link>
        </div>

        <div className="geo-status-card">
          <div className="geo-status-head">
            <span className="geo-status-icon">{"\u2728"}</span>
            Prompt Research
          </div>
          <div className="geo-status-body">
            <div className="geo-status-metric">
              <span className="geo-status-n">{kpis.clusters}</span>
              <span className="geo-status-l">Intent cluster</span>
            </div>
          </div>
          <Link href={`${base}/prompt-research/generator`} className="geo-status-link">Genera prompt →</Link>
        </div>
      </div>

      {/* Quick start */}
      {kpis.totalPrompts === 0 && (
        <div className="geo-empty">
          <div className="geo-empty-title">Inizia configurando il progetto</div>
          <p>Vai nel <Link href={`${base}/prompt-research/generator`}>Prompt Generator</Link> per generare i primi prompt, poi scansionali nel <Link href={`${base}/brand-report/prompt-monitor`}>Prompt Monitor</Link>.</p>
        </div>
      )}
    </div>
  );
}

function SecKPI({ label, value, suffix, color }: {
  label: string; value: number; suffix: string; color: string;
}) {
  return (
    <div className="geo-sec-kpi">
      <span className={`geo-sec-n geo-c-${color}`}>{value}{suffix}</span>
      <span className="geo-sec-l">{label}</span>
    </div>
  );
}
