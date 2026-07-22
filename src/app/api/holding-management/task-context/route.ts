import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";
import { dataVersion } from "@/lib/square-marketing-data";
import type { FwData, FwGoalData } from "@/lib/flywheel";
import type { Persona } from "@/lib/people";

/**
 * Restituisce il context necessario alla pagina Task Manager in una sola call:
 *  - operatives: elenco aziende operative
 *  - peopleByOperative: nomi persone per operativa (per il dropdown assignee)
 *  - goalsByOperative:  goal (fn, goal, sub?) per operativa+anno (per il dropdown goal)
 *
 * Fonti dati:
 *  - companies: type='operative'
 *  - people: app_state key='people' + `people:v{dv}` fallback
 *  - goals:  app_state key='fwData' + `fwData:v{dv}` per anno
 */

interface OperativeMeta { slug: string; name: string; color: string }

export interface GoalRef { fn: string; goal: string; sub?: string; owner?: string | null }

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : 2026;
  if (Number.isNaN(year)) return NextResponse.json({ error: "year invalido" }, { status: 400 });

  const svc = createServiceClient();

  const { data: companies, error: cErr } = await svc
    .from("companies")
    .select("slug, name, color, type")
    .eq("type", "operative")
    .order("name");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const operatives: OperativeMeta[] = (companies ?? []).map((c) => ({ slug: c.slug, name: c.name, color: c.color }));
  const slugs = operatives.map((o) => o.slug);
  if (slugs.length === 0) {
    return NextResponse.json({ operatives, peopleByOperative: {}, goalsByOperative: {}, year });
  }

  // Costruiamo il set di key da cercare: sia versione base (people, fwData) sia
  // versionate (people:vN, fwData:vN) per ogni company.
  const wantedKeys = new Set<string>();
  for (const s of slugs) {
    wantedKeys.add("people");
    wantedKeys.add("fwData");
    const dv = dataVersion(s);
    if (dv != null) {
      wantedKeys.add(`people:v${dv}`);
      wantedKeys.add(`fwData:v${dv}`);
    }
  }

  const { data: states, error: sErr } = await svc
    .from("app_state")
    .select("company, key, data")
    .in("company", slugs)
    .in("key", Array.from(wantedKeys))
    .eq("year", year);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const peopleByOperative: Record<string, string[]> = {};
  const goalsByOperative: Record<string, GoalRef[]> = {};

  const bestPeopleKey = (slug: string) => {
    const dv = dataVersion(slug);
    return dv != null ? `people:v${dv}` : "people";
  };
  const bestFwKey = (slug: string) => {
    const dv = dataVersion(slug);
    return dv != null ? `fwData:v${dv}` : "fwData";
  };

  // Raccogliamo tutte le righe in una mappa (company → { key → data }).
  const byCompany: Record<string, Record<string, unknown>> = {};
  for (const row of states ?? []) {
    byCompany[row.company] ??= {};
    byCompany[row.company][row.key] = row.data;
  }

  for (const s of slugs) {
    const map = byCompany[s] || {};
    // People: preferisci la versionata, fallback su base
    const peopleData = (map[bestPeopleKey(s)] ?? map["people"]) as { persone?: Persona[] } | Persona[] | undefined;
    const persone: Persona[] = Array.isArray(peopleData)
      ? peopleData
      : Array.isArray((peopleData as { persone?: Persona[] } | undefined)?.persone)
      ? ((peopleData as { persone: Persona[] }).persone)
      : [];
    peopleByOperative[s] = persone.map((p) => p.nome).filter(Boolean);

    // Goals: pull tutti i (fn, goal, sub?) da fwData
    const fw = (map[bestFwKey(s)] ?? map["fwData"]) as FwData | undefined;
    const goals: GoalRef[] = [];
    if (fw && typeof fw === "object") {
      for (const fn of Object.keys(fw)) {
        const inner = (fw as Record<string, Record<string, FwGoalData>>)[fn];
        if (!inner || typeof inner !== "object") continue;
        for (const goalName of Object.keys(inner)) {
          if (goalName.startsWith("_")) continue;
          const g = inner[goalName];
          if (!g) continue;
          goals.push({ fn, goal: goalName, owner: g.owner ?? null });
          const subs = g.subgoals || {};
          for (const subName of Object.keys(subs)) {
            if (subName.startsWith("_")) continue;
            goals.push({ fn, goal: goalName, sub: subName, owner: subs[subName]?.owner ?? g.owner ?? null });
          }
        }
      }
    }
    goalsByOperative[s] = goals;
  }

  return NextResponse.json({ operatives, peopleByOperative, goalsByOperative, year });
}
