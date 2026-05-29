/* ── GEO Tool Suite — Scoring ── */

import type { GEOProject, GEOPrompt, GEOScan, GEOPriorityTier } from "./types";

/* ── Per-prompt metrics ── */

/** Brand mention rate for a single prompt across all its scans */
export function promptMentionRate(p: GEOPrompt): number {
  if (p.scans.length === 0) return 0;
  const mentioned = p.scans.filter((s) => s.brandMentioned).length;
  return Math.round((mentioned / p.scans.length) * 100);
}

/** Average brand position across scans where mentioned */
export function promptAvgPosition(p: GEOPrompt): number | null {
  const positions = p.scans.filter((s) => s.brandMentioned && s.brandPosition).map((s) => s.brandPosition!);
  if (positions.length === 0) return null;
  return Math.round(positions.reduce((a, b) => a + b, 0) / positions.length * 10) / 10;
}

/** Average sentiment score for a prompt (-1 to 1) */
export function promptSentimentAvg(p: GEOPrompt): number {
  const scansWithMention = p.scans.filter((s) => s.brandMentioned);
  if (scansWithMention.length === 0) return 0;
  return Math.round(scansWithMention.reduce((a, s) => a + s.sentiment.score, 0) / scansWithMention.length * 100) / 100;
}

/* ── Opportunity Scorer ── */

export function computeOpportunityScore(p: GEOPrompt): number {
  const mentionRate = promptMentionRate(p);
  const gap = 100 - mentionRate; // higher gap = more opportunity
  const value = p.commercialValue;
  const funnelMultiplier = p.funnelStage === "BOFU" ? 1.5 : p.funnelStage === "MOFU" ? 1.2 : 0.8;
  return Math.round(Math.min(100, (gap * 0.4 + value * 0.4) * funnelMultiplier + (p.scans.length > 0 ? 10 : 0)));
}

export function computeEffortScore(p: GEOPrompt): number {
  // Lower effort = easier. Based on current presence and content availability
  const mentionRate = promptMentionRate(p);
  const hasScans = p.scans.length > 0;
  // If already somewhat present, effort is lower
  const presenceBonus = mentionRate > 0 ? 20 : 0;
  return Math.round(Math.max(10, 70 - presenceBonus - (hasScans ? 10 : 0)));
}

export function computeImpactScore(p: GEOPrompt): number {
  const value = p.commercialValue;
  const funnelMultiplier = p.funnelStage === "BOFU" ? 1.4 : p.funnelStage === "MOFU" ? 1.1 : 0.8;
  return Math.round(Math.min(100, value * funnelMultiplier));
}

export function computePriorityTier(opportunity: number, effort: number): GEOPriorityTier {
  if (opportunity >= 60 && effort <= 50) return "quick_win";
  if (opportunity >= 60 && effort > 50) return "strategic_bet";
  if (opportunity < 40) return "low_priority";
  return "long_term";
}

export function enrichPromptScores(p: GEOPrompt): GEOPrompt {
  const opportunityScore = computeOpportunityScore(p);
  const effortScore = computeEffortScore(p);
  const impactScore = computeImpactScore(p);
  const priorityTier = computePriorityTier(opportunityScore, effortScore);
  return { ...p, opportunityScore, effortScore, impactScore, priorityTier };
}

/* ── Project-level KPIs ── */

export function aiVisibilityScore(project: GEOProject): number {
  const { prompts } = project;
  if (prompts.length === 0) return 0;
  const scannedPrompts = prompts.filter((p) => p.scans.length > 0);
  if (scannedPrompts.length === 0) return 0;

  const mentionRates = scannedPrompts.map(promptMentionRate);
  const avgMention = mentionRates.reduce((a, b) => a + b, 0) / mentionRates.length;

  const positions = scannedPrompts.map(promptAvgPosition).filter((p): p is number => p !== null);
  const positionScore = positions.length > 0
    ? Math.max(0, 100 - (positions.reduce((a, b) => a + b, 0) / positions.length) * 10)
    : 0;

  const sentiments = scannedPrompts.map(promptSentimentAvg);
  const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  const sentimentScore = (avgSentiment + 1) * 50; // normalize -1..1 to 0..100

  return Math.round(avgMention * 0.5 + positionScore * 0.3 + sentimentScore * 0.2);
}

export function promptCoverageScore(project: GEOProject): number {
  if (project.prompts.length === 0) return 0;
  const scanned = project.prompts.filter((p) => p.scans.length > 0).length;
  return Math.round((scanned / project.prompts.length) * 100);
}

export function brandMentionRate(project: GEOProject): number {
  const allScans = project.prompts.flatMap((p) => p.scans);
  if (allScans.length === 0) return 0;
  const mentioned = allScans.filter((s) => s.brandMentioned).length;
  return Math.round((mentioned / allScans.length) * 100);
}

export function competitorMentionRate(project: GEOProject): number {
  const allScans = project.prompts.flatMap((p) => p.scans);
  if (allScans.length === 0) return 0;
  const withCompetitors = allScans.filter((s) => s.competitorMentions.length > 0).length;
  return Math.round((withCompetitors / allScans.length) * 100);
}

export function citationShareOwned(project: GEOProject): number {
  const allCitations = project.prompts.flatMap((p) => p.scans.flatMap((s) => s.citations));
  if (allCitations.length === 0) return 0;
  const owned = allCitations.filter((c) => c.type === "owned").length;
  return Math.round((owned / allCitations.length) * 100);
}

export function avgSentimentScore(project: GEOProject): number {
  const allScans = project.prompts.flatMap((p) => p.scans).filter((s) => s.brandMentioned);
  if (allScans.length === 0) return 0;
  const avg = allScans.reduce((a, s) => a + s.sentiment.score, 0) / allScans.length;
  return Math.round((avg + 1) * 50); // -1..1 → 0..100
}

export function avgOpportunityScore(project: GEOProject): number {
  const scored = project.prompts.filter((p) => p.opportunityScore != null);
  if (scored.length === 0) return 0;
  return Math.round(scored.reduce((a, p) => a + (p.opportunityScore || 0), 0) / scored.length);
}

/* ── Aggregation helpers ── */

export function allScans(project: GEOProject): GEOScan[] {
  return project.prompts.flatMap((p) => p.scans);
}

export function allCitations(project: GEOProject): (GEOScan["citations"][0] & { promptId: string; llm: string })[] {
  return project.prompts.flatMap((p) =>
    p.scans.flatMap((s) =>
      s.citations.map((c) => ({ ...c, promptId: p.id, llm: s.llm }))
    )
  );
}

export function allCompetitorMentions(project: GEOProject): (GEOScan["competitorMentions"][0] & { promptId: string; llm: string })[] {
  return project.prompts.flatMap((p) =>
    p.scans.flatMap((s) =>
      s.competitorMentions.map((c) => ({ ...c, promptId: p.id, llm: s.llm }))
    )
  );
}

/** Unique competitors ranked by mention count */
export function competitorRanking(project: GEOProject): { name: string; mentions: number; promptCount: number; avgSentiment: string }[] {
  const mentions = allCompetitorMentions(project);
  const map = new Map<string, { count: number; prompts: Set<string>; sentiments: string[] }>();
  for (const m of mentions) {
    if (!map.has(m.name)) map.set(m.name, { count: 0, prompts: new Set(), sentiments: [] });
    const entry = map.get(m.name)!;
    entry.count++;
    entry.prompts.add(m.promptId);
    entry.sentiments.push(m.sentiment);
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({
      name,
      mentions: data.count,
      promptCount: data.prompts.size,
      avgSentiment: mostFrequent(data.sentiments),
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

/** Unique citations ranked by frequency */
export function citationRanking(project: GEOProject): { domain: string; url: string; title?: string; count: number; type: string; brandMentioned: boolean; promptCount: number }[] {
  const cites = allCitations(project);
  const map = new Map<string, { url: string; title?: string; count: number; type: string; brand: boolean; prompts: Set<string> }>();
  for (const c of cites) {
    const key = c.url || c.domain;
    if (!map.has(key)) map.set(key, { url: c.url, title: c.title, count: 0, type: c.type, brand: c.brandMentioned, prompts: new Set() });
    const entry = map.get(key)!;
    entry.count++;
    entry.prompts.add(c.promptId);
  }
  return Array.from(map.entries())
    .map(([domain, data]) => ({
      domain, url: data.url, title: data.title,
      count: data.count, type: data.type,
      brandMentioned: data.brand, promptCount: data.prompts.size,
    }))
    .sort((a, b) => b.count - a.count);
}

function mostFrequent(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let max = 0, result = arr[0] || "neutro";
  for (const [k, v] of counts) { if (v > max) { max = v; result = k; } }
  return result;
}

/** Score color thresholds */
export function scoreColor(score: number): "red" | "org" | "grn" {
  if (score >= 60) return "grn";
  if (score >= 30) return "org";
  return "red";
}
