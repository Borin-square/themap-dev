import { NextRequest, NextResponse } from "next/server";

/* ── CSV parser ── */

function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let inQ = false;
  let row: string[] = [];

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQ) {
      if (ch === '"' && csv[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cur.trim()); cur = ""; }
      else if (ch === "\n" || (ch === "\r" && csv[i + 1] === "\n")) {
        row.push(cur.trim()); cur = "";
        if (row.some((c) => c !== "")) rows.push(row);
        row = [];
        if (ch === "\r") i++;
      } else cur += ch;
    }
  }
  row.push(cur.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/* ── Helpers ── */

function extractSheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function fetchTab(sheetId: string, tabName: string): Promise<string[][] | null> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    // Google returns HTML if sheet not found / not shared
    if (text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) return null;
    return parseCSV(text);
  } catch {
    return null;
  }
}

const HEADER_MAP: Record<string, string> = {
  nome: "nome", "nome campagna": "nome", campaign: "nome", name: "nome",
  piattaforma: "piattaforma", platform: "piattaforma",
  canale: "canale", channel: "canale",
  obiettivo: "obiettivo", objective: "obiettivo", goal: "obiettivo",
  stato: "stato", status: "stato",
  inizio: "data_inizio", "data inizio": "data_inizio", "data_inizio": "data_inizio", start: "data_inizio",
  fine: "data_fine", "data fine": "data_fine", "data_fine": "data_fine", end: "data_fine",
  target: "target", audience: "target",
  "landing page": "landing_page", "landing_page": "landing_page", landing: "landing_page", url: "landing_page",
  note: "note", notes: "note",
};

const METRIC_MAP: Record<string, string> = {
  "budget fc": "BUDGET_FC", "budget_fc": "BUDGET_FC", "budget forecast": "BUDGET_FC",
  "budget re": "BUDGET_RE", "budget_re": "BUDGET_RE", "budget reale": "BUDGET_RE", "budget consuntivo": "BUDGET_RE",
  "lead fc": "LEAD_FC", "lead_fc": "LEAD_FC", "lead forecast": "LEAD_FC",
  "lead re": "LEAD_RE", "lead_re": "LEAD_RE", "lead reale": "LEAD_RE", "lead consuntivo": "LEAD_RE",
  impressioni: "IMPRESSIONI", impressions: "IMPRESSIONI",
  click: "CLICK", clicks: "CLICK",
  roas: "ROAS",
};

const MONTH_NAMES = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

interface RawCampaign {
  nome: string;
  piattaforma: string;
  canale: string;
  obiettivo: string;
  stato: string;
  data_inizio: string;
  data_fine: string;
  target: string;
  landing_page: string;
  note: string;
}

/* ── Main handler ── */

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL mancante" }, { status: 400 });
    }

    const sheetId = extractSheetId(url);
    if (!sheetId) {
      return NextResponse.json({ error: "URL Google Sheets non valido" }, { status: 400 });
    }

    // Try common tab names for campaign metadata
    const campTabNames = ["Campagne", "campagne", "Campaigns", "campaigns"];
    let campRows: string[][] | null = null;
    for (const name of campTabNames) {
      campRows = await fetchTab(sheetId, name);
      if (campRows) break;
    }

    if (!campRows || campRows.length < 2) {
      return NextResponse.json({
        error: "Tab 'Campagne' non trovato o vuoto. Verifica che il foglio sia condiviso (chiunque con il link) e che esista un tab chiamato 'Campagne'.",
      }, { status: 400 });
    }

    // Parse campaign headers
    const campHeaders = campRows[0].map((h) => HEADER_MAP[h.toLowerCase()] || null);
    const col = (row: string[], field: string) => {
      const idx = campHeaders.indexOf(field);
      return idx >= 0 ? (row[idx] || "") : "";
    };

    // Build campaigns
    const rawCampaigns: RawCampaign[] = [];
    for (let i = 1; i < campRows.length; i++) {
      const r = campRows[i];
      const nome = col(r, "nome");
      if (!nome) continue;

      // Normalize stato
      let stato = col(r, "stato").toUpperCase();
      const validStati = ["PIANIFICATA", "ATTIVA", "IN PAUSA", "COMPLETATA", "ANNULLATA"];
      if (!validStati.includes(stato)) stato = "PIANIFICATA";

      // Normalize dates (accept dd/mm/yyyy or yyyy-mm-dd)
      const normDate = (d: string) => {
        if (!d) return "";
        if (d.includes("/")) {
          const parts = d.split("/");
          if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
        return d;
      };

      rawCampaigns.push({
        nome,
        piattaforma: col(r, "piattaforma") || "Altro",
        canale: col(r, "canale"),
        obiettivo: col(r, "obiettivo"),
        stato,
        data_inizio: normDate(col(r, "data_inizio")),
        data_fine: normDate(col(r, "data_fine")),
        target: col(r, "target"),
        landing_page: col(r, "landing_page"),
        note: col(r, "note"),
      });
    }

    if (rawCampaigns.length === 0) {
      return NextResponse.json({ error: "Nessuna campagna trovata nel tab 'Campagne'." }, { status: 400 });
    }

    // Try to fetch monthly data tab
    const datiTabNames = ["Dati", "dati", "Dati Mensili", "dati mensili", "Data", "Metriche", "metriche"];
    let datiRows: string[][] | null = null;
    for (const name of datiTabNames) {
      datiRows = await fetchTab(sheetId, name);
      if (datiRows) break;
    }

    // Build periodi map: campaignName → metric → 12 months
    const periodiMap = new Map<string, Record<string, (number | null)[]>>();

    if (datiRows && datiRows.length >= 2) {
      // Headers: Campagna | Metrica | Gen | Feb | ... | Dic
      // Find month columns
      const dHeaders = datiRows[0].map((h) => h.toLowerCase().trim());
      const campCol = Math.max(
        dHeaders.findIndex((h) => ["campagna", "campaign", "nome", "nome campagna"].includes(h)),
        0,
      );
      const metCol = Math.max(
        dHeaders.findIndex((h) => ["metrica", "metric", "kpi"].includes(h)),
        campCol === 0 ? 1 : 0,
      );

      // Map month headers to indices
      const monthCols: number[] = [];
      for (let mi = 0; mi < 12; mi++) {
        const idx = dHeaders.findIndex((h) =>
          h === MONTH_NAMES[mi] || h.startsWith(MONTH_NAMES[mi]),
        );
        monthCols.push(idx);
      }

      for (let i = 1; i < datiRows.length; i++) {
        const r = datiRows[i];
        const campName = (r[campCol] || "").trim();
        const metRaw = (r[metCol] || "").trim().toLowerCase();
        const met = METRIC_MAP[metRaw];
        if (!campName || !met) continue;

        if (!periodiMap.has(campName)) periodiMap.set(campName, {});
        const periodi = periodiMap.get(campName)!;
        if (!periodi[met]) periodi[met] = Array(12).fill(null);

        for (let mi = 0; mi < 12; mi++) {
          if (monthCols[mi] < 0) continue;
          const raw = (r[monthCols[mi]] || "").replace(/[€$\s]/g, "").replace(",", ".");
          const num = parseFloat(raw);
          if (!isNaN(num)) periodi[met][mi] = num;
        }
      }
    }

    // Assemble final campaigns
    const campaigns = rawCampaigns.map((rc) => ({
      id: crypto.randomUUID(),
      ...rc,
      periodi: periodiMap.get(rc.nome) || {},
    }));

    return NextResponse.json({
      campaigns,
      message: `${campaigns.length} campagn${campaigns.length === 1 ? "a importata" : "e importate"}${datiRows ? ` con dati mensili` : " (tab 'Dati' non trovato — solo anagrafica)"}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Errore di importazione" }, { status: 500 });
  }
}
