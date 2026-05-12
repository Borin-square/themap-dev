// === TYPES ===

export interface EeMetric {
  metrica: string;
  tipologia: "DA DEFINIRE" | "STIMA" | "OBIETTIVO" | "CALCOLATO";
  funzione: string;
  anni: Record<number, number | null>;
  descrizione?: string;
  descCalcolo?: string;
  benchMin?: number | null;
  benchMax?: number | null;
}

export interface EeMonthlyRow {
  ricRic: number;
  ricStock: number;
  ricTot: number;
  costiOp: number;
  costiVar: number;
  costiAcq: number;
  costiFissi: number;
  costiTot: number;
}

export interface EeScenario {
  id: number;
  nome: string;
  descrizione: string;
  anno: number;
  data: string;
  values: Record<string, number>;
}

// === CONSTANTS ===

export const EE_SECTION_ORDER = [
  "DA DEFINIRE",
  "STIMA",
  "OBIETTIVO",
  "CALCOLATO",
] as const;

export const EE_SECTION_LABELS: Record<string, string> = {
  "DA DEFINIRE": "Leve",
  STIMA: "Stime",
  OBIETTIVO: "Obiettivi",
  CALCOLATO: "Calcolati",
};

export const EE_SECTION_SLUGS: Record<string, string> = {
  "DA DEFINIRE": "leve",
  STIMA: "stime",
  OBIETTIVO: "obiettivi",
  CALCOLATO: "calcolati",
};

export const EE_FN_ORDER = [
  "AMMINISTRAZIONE",
  "OPERATION",
  "SALES",
  "MARKETING",
];

export const EE_INVERTED = [
  "CHURN RATE",
  "COSTO ORARIO DIPENDENTE",
  "COSTO VAR.",
  "BUDGET MARKETING",
  "COSTI FISSI",
];

export const EE_AUTO_CALC = ["VENDITE MESE"];

export const EE_KPI_ITEMS = [
  { label: "TOTALE VENDITE", key: "TOTALE VENDITE", mk: "ricTot" as const, clr: "var(--fg)" },
  { label: "VALORE PRODUZIONE", key: "VALORE DELLA PRODUZIONE", mk: "ricTot" as const, clr: "var(--fg)" },
  { label: "TOTALE COSTI", key: "TOTALE COSTI", mk: "costiTot" as const, clr: "var(--org)" },
  { label: "MARGINE LORDO", key: "MARGINE LORDO (NO BANDI)", mk: null, clr: "var(--grn)" },
  { label: "VALORE AZIENDA", key: "VALORE AZIENDA", mk: null, clr: "var(--accent)" },
];

export const EE_KPI_DEPS: Record<string, string[]> = {
  "TOTALE VENDITE": [
    "N° OFFERTE F. SALES",
    "N° OFFERTE FONTE MARKETING",
    "TASSO DI CHIUSURA F. SALES",
    "TASSO DI CHIUSURA F. MARKETING",
    "VALORE VENDITA MEDIA",
  ],
  "VALORE DELLA PRODUZIONE": [
    "PARTENZA RICORRENTE",
    "N° OFFERTE F. SALES",
    "N° OFFERTE FONTE MARKETING",
    "TASSO DI CHIUSURA F. SALES",
    "TASSO DI CHIUSURA F. MARKETING",
    "VALORE VENDITA MEDIA",
    "PERC. RICORRENTI",
    "PERC. STOCK",
    "CHURN RATE",
  ],
  "TOTALE COSTI": [
    "PREZZO MEDIO ORARIO",
    "COSTO ORARIO DIPENDENTE",
    "% ORE LAVORATE",
    "TASSO DI TRASFERIMENTO",
    "COSTO VAR.",
    "BUDGET MARKETING",
    "COSTI FISSI",
  ],
  "MARGINE LORDO (NO BANDI)": [
    "PARTENZA RICORRENTE",
    "N° OFFERTE F. SALES",
    "N° OFFERTE FONTE MARKETING",
    "TASSO DI CHIUSURA F. SALES",
    "TASSO DI CHIUSURA F. MARKETING",
    "VALORE VENDITA MEDIA",
    "PERC. RICORRENTI",
    "PERC. STOCK",
    "CHURN RATE",
    "PREZZO MEDIO ORARIO",
    "COSTO ORARIO DIPENDENTE",
    "% ORE LAVORATE",
    "TASSO DI TRASFERIMENTO",
    "COSTO VAR.",
    "BUDGET MARKETING",
    "COSTI FISSI",
  ],
  "VALORE AZIENDA": [
    "MULTIPLO",
    "PARTENZA RICORRENTE",
    "N° OFFERTE F. SALES",
    "N° OFFERTE FONTE MARKETING",
    "TASSO DI CHIUSURA F. SALES",
    "TASSO DI CHIUSURA F. MARKETING",
    "VALORE VENDITA MEDIA",
    "PERC. RICORRENTI",
    "PERC. STOCK",
    "CHURN RATE",
    "PREZZO MEDIO ORARIO",
    "COSTO ORARIO DIPENDENTE",
    "% ORE LAVORATE",
    "TASSO DI TRASFERIMENTO",
    "COSTO VAR.",
    "BUDGET MARKETING",
    "COSTI FISSI",
  ],
};

export const EE_MONTHS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

// === CALCULATION ===

export function eeRecalc(
  values: Record<string, number>,
  startMonth = 0,
): { calc: Record<string, number>; monthly: EeMonthlyRow[] } {
  const calc: Record<string, number> = {};
  const monthly: EeMonthlyRow[] = [];
  const g = (k: string) => values[k] || 0;

  const numVenditeSales = Math.floor(
    g("N° OFFERTE F. SALES") * g("TASSO DI CHIUSURA F. SALES"),
  );
  const numVenditeMarketing = Math.floor(
    g("N° OFFERTE FONTE MARKETING") * g("TASSO DI CHIUSURA F. MARKETING"),
  );
  const numTotVendite = numVenditeSales + numVenditeMarketing;
  const totOfferte =
    g("N° OFFERTE F. SALES") + g("N° OFFERTE FONTE MARKETING");
  const trattativeScarto =
    totOfferte - g("N° COMMERCIALI") * g("CAPIENZA SALES EXECUTIVE");
  const valVendMedia = g("VALORE VENDITA MEDIA");
  const venditaMeseVal = numTotVendite * valVendMedia;
  const vendMediaAnnua =
    g("N° COMMERCIALI") > 0
      ? (venditaMeseVal * 12) / g("N° COMMERCIALI")
      : 0;
  const costoAcqMedio =
    numVenditeMarketing > 0
      ? g("BUDGET MARKETING") / numVenditeMarketing
      : 0;
  const totVendite = venditaMeseVal * 12;

  calc["VENDITE MESE"] = venditaMeseVal;
  calc["NUMERO VENDITE SALES"] = numVenditeSales;
  calc["NUMERO VENDITE MARKETING"] = numVenditeMarketing;
  calc["NUMERO TOTALE VENDITE"] = numTotVendite;
  calc["TOTALE OFFERTE"] = totOfferte;
  calc["TRATTATIVE SCARTO"] = trattativeScarto;
  calc["VENDITA MEDIA ANNUA PER COMMERCIALE"] = vendMediaAnnua;
  calc["COSTO ACQUISIZIONE MEDIO"] = costoAcqMedio;
  calc["TOTALE VENDITE"] = totVendite;

  const partenza = g("PARTENZA RICORRENTE");
  const churn = g("CHURN RATE");
  const percRic = g("PERC. RICORRENTI");
  const percStock = g("PERC. STOCK");
  const prezzoOrario = g("PREZZO MEDIO ORARIO");
  const costoOrario = g("COSTO ORARIO DIPENDENTE");
  const percOre = g("% ORE LAVORATE");
  const trasf = g("TASSO DI TRASFERIMENTO");
  const costoVarPerc = g("COSTO VAR.");
  const budgetMkt = g("BUDGET MARKETING");
  const costiFissiVal = g("COSTI FISSI");

  let prevRic = partenza;
  let sumRicTot = 0;
  let sumCostiTot = 0;

  for (let m = 0; m < 12; m++) {
    if (m < startMonth) {
      monthly.push({
        ricRic: 0, ricStock: 0, ricTot: 0,
        costiOp: 0, costiVar: 0, costiAcq: 0, costiFissi: 0, costiTot: 0,
      });
      continue;
    }
    const ricRic =
      prevRic +
      (numTotVendite * valVendMedia * percRic) / 12 -
      prevRic * churn;
    const ricStock = valVendMedia * numTotVendite * percStock;
    const ricTot = ricRic + ricStock;

    const costiOp =
      prezzoOrario > 0
        ? (ricTot / prezzoOrario) * costoOrario * percOre / (trasf || 1)
        : 0;
    const costiVar = ricTot * costoVarPerc;
    const costiAcq = budgetMkt;
    const costiFissi = costiFissiVal;
    const costiTot = costiOp + costiVar + costiAcq + costiFissi;

    monthly.push({
      ricRic, ricStock, ricTot,
      costiOp, costiVar, costiAcq, costiFissi, costiTot,
    });

    sumRicTot += ricTot;
    sumCostiTot += costiTot;
    prevRic = ricRic;
  }

  calc["VALORE DELLA PRODUZIONE"] = sumRicTot;
  calc["TOTALE COSTI"] = sumCostiTot;
  calc["MARGINE LORDO (NO BANDI)"] = sumRicTot - sumCostiTot;
  calc["VALORE AZIENDA"] = (sumRicTot - sumCostiTot) * (g("MULTIPLO") || 0);

  calc["CAPACITY NECESSARIA"] =
    prezzoOrario > 0
      ? (sumRicTot / prezzoOrario) * percOre / (trasf || 1)
      : 0;

  return { calc, monthly };
}

// === FORMATTING ===

export function eeIsPercent(metrica: string): boolean {
  const m = metrica.toUpperCase();
  return (
    m.includes("TASSO") ||
    m.includes("CHURN") ||
    m.includes("PERC") ||
    m.includes("% ") ||
    m.includes("COSTO VAR")
  );
}

export function eeFmtVal(
  v: number | null | undefined,
  metrica?: string,
): string {
  if (v === null || v === undefined || isNaN(v)) return "\u2014";
  const met = (metrica || "").toUpperCase();
  if (
    met.includes("TASSO") ||
    met.includes("CHURN") ||
    met.includes("PERC") ||
    met.includes("% ") ||
    met.includes("COSTO VAR")
  ) {
    if (v > 0 && v < 1) return (v * 100).toFixed(1) + "%";
    return v.toFixed(1) + "%";
  }
  if (
    met.includes("COSTO ORARIO") ||
    met.includes("PREZZO MEDIO") ||
    met.includes("VALORE VENDITA") ||
    met.includes("BUDGET") ||
    met === "COSTI FISSI" ||
    met.includes("PARTENZA") ||
    met.includes("VENDITE MESE")
  ) {
    return "\u20AC " + Math.round(v).toLocaleString("it-IT");
  }
  if (Math.abs(v) >= 1e6) return "\u20AC " + (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return "\u20AC " + (v / 1e3).toFixed(0) + "K";
  if (v === Math.floor(v)) return v.toLocaleString("it-IT");
  return v.toFixed(2);
}

export function eeFmtEuro(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "\u2014";
  return "\u20AC " + Math.round(v).toLocaleString("it-IT");
}

export function eeFmtInput(
  v: number | null | undefined,
  metrica: string,
): string {
  if (v === null || v === undefined) return "";
  const met = metrica.toUpperCase();
  if (
    met.includes("TASSO") ||
    met.includes("CHURN") ||
    met.includes("PERC") ||
    met.includes("% ") ||
    met.includes("COSTO VAR")
  ) {
    if (v > 0 && v < 1) return (v * 100).toFixed(1);
    return String(v);
  }
  return String(v);
}

export function eeParseInput(raw: string, metrica: string): number {
  const s = raw.replace(/[€%,\s]/g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  const met = metrica.toUpperCase();
  if (
    met.includes("TASSO") ||
    met.includes("CHURN") ||
    met.includes("PERC") ||
    met.includes("% ") ||
    met.includes("COSTO VAR")
  ) {
    if (n > 1) return n / 100;
    return n;
  }
  return n;
}

export function eeGetDelta(
  cur: number | null | undefined,
  prev: number | null | undefined,
): number | null {
  if (
    prev === null ||
    prev === undefined ||
    prev === 0 ||
    cur === null ||
    cur === undefined
  )
    return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function eeCheckConstraints(
  values: Record<string, number>,
): Record<string, string> {
  const warnings: Record<string, string> = {};
  const totOfferte =
    (values["N° OFFERTE F. SALES"] || 0) +
    (values["N° OFFERTE FONTE MARKETING"] || 0);
  const capienza =
    (values["N° COMMERCIALI"] || 0) *
    (values["CAPIENZA SALES EXECUTIVE"] || 0);
  if (capienza > 0 && totOfferte > capienza) {
    const msg = `Offerte (${Math.round(totOfferte)}) > Capienza Sales (${Math.round(capienza)})`;
    warnings["N° OFFERTE F. SALES"] = msg;
    warnings["N° OFFERTE FONTE MARKETING"] = msg;
  }
  return warnings;
}

// === SPARKLINE ===

export function eeSparkPoints(
  monthly: EeMonthlyRow[],
  key: keyof EeMonthlyRow,
  startM: number,
): string {
  const vals: number[] = [];
  for (let i = startM; i < 12; i++) vals.push(monthly[i][key] || 0);
  if (!vals.length) return "";
  let mn = Math.min(...vals),
    mx = Math.max(...vals);
  if (mx === mn) mx = mn + 1;
  const w = 80,
    h = 20;
  const pts: string[] = [];
  for (let i = 0; i < vals.length; i++) {
    const x = vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2;
    const y = h - ((vals[i] - mn) / (mx - mn)) * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export function eeMarginSparkPoints(
  monthly: EeMonthlyRow[],
  startM: number,
): string {
  const vals: number[] = [];
  for (let i = startM; i < 12; i++)
    vals.push(monthly[i].ricTot - monthly[i].costiTot);
  if (!vals.length) return "";
  let mn = Math.min(...vals),
    mx = Math.max(...vals);
  if (mx === mn) mx = mn + 1;
  const w = 80,
    h = 20;
  const pts: string[] = [];
  for (let i = 0; i < vals.length; i++) {
    const x = vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2;
    const y = h - ((vals[i] - mn) / (mx - mn)) * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// === MOCK DATA ===

const YEAR = new Date().getFullYear();

export function getEeYear() {
  return YEAR;
}

export function getEeMockMetrics(): EeMetric[] {
  return [
    // DA DEFINIRE — SALES
    { metrica: "N° OFFERTE F. SALES", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 30, [YEAR - 1]: 25 }, descrizione: "Numero offerte generate dal team sales" },
    { metrica: "N° OFFERTE FONTE MARKETING", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 20, [YEAR - 1]: 15 }, descrizione: "Offerte generate dal marketing" },
    { metrica: "TASSO DI CHIUSURA F. SALES", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 0.35, [YEAR - 1]: 0.3 }, descrizione: "% chiusura offerte sales" },
    { metrica: "TASSO DI CHIUSURA F. MARKETING", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 0.25, [YEAR - 1]: 0.2 }, descrizione: "% chiusura offerte marketing" },
    { metrica: "VALORE VENDITA MEDIA", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 5000, [YEAR - 1]: 4500 }, descrizione: "Valore medio per vendita" },
    { metrica: "N° COMMERCIALI", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 3, [YEAR - 1]: 2 } },
    { metrica: "CAPIENZA SALES EXECUTIVE", tipologia: "DA DEFINIRE", funzione: "SALES", anni: { [YEAR]: 15, [YEAR - 1]: 15 }, descrizione: "N° max offerte per commerciale" },
    // DA DEFINIRE — MARKETING
    { metrica: "BUDGET MARKETING", tipologia: "DA DEFINIRE", funzione: "MARKETING", anni: { [YEAR]: 3000, [YEAR - 1]: 2500 } },
    // DA DEFINIRE — OPERATION
    { metrica: "PREZZO MEDIO ORARIO", tipologia: "DA DEFINIRE", funzione: "OPERATION", anni: { [YEAR]: 85, [YEAR - 1]: 80 } },
    { metrica: "COSTO ORARIO DIPENDENTE", tipologia: "DA DEFINIRE", funzione: "OPERATION", anni: { [YEAR]: 28, [YEAR - 1]: 26 } },
    { metrica: "% ORE LAVORATE", tipologia: "DA DEFINIRE", funzione: "OPERATION", anni: { [YEAR]: 0.75, [YEAR - 1]: 0.72 } },
    { metrica: "TASSO DI TRASFERIMENTO", tipologia: "DA DEFINIRE", funzione: "OPERATION", anni: { [YEAR]: 0.85, [YEAR - 1]: 0.82 } },
    // DA DEFINIRE — AMMINISTRAZIONE
    { metrica: "COSTI FISSI", tipologia: "DA DEFINIRE", funzione: "AMMINISTRAZIONE", anni: { [YEAR]: 12000, [YEAR - 1]: 11000 } },
    { metrica: "COSTO VAR.", tipologia: "DA DEFINIRE", funzione: "AMMINISTRAZIONE", anni: { [YEAR]: 0.05, [YEAR - 1]: 0.05 } },

    // STIMA — OPERATION
    { metrica: "PARTENZA RICORRENTE", tipologia: "STIMA", funzione: "OPERATION", anni: { [YEAR]: 15000, [YEAR - 1]: 12000 }, descrizione: "Ricavo ricorrente iniziale" },
    { metrica: "PERC. RICORRENTI", tipologia: "STIMA", funzione: "OPERATION", anni: { [YEAR]: 0.6, [YEAR - 1]: 0.55 } },
    { metrica: "PERC. STOCK", tipologia: "STIMA", funzione: "OPERATION", anni: { [YEAR]: 0.4, [YEAR - 1]: 0.45 } },
    { metrica: "CHURN RATE", tipologia: "STIMA", funzione: "OPERATION", anni: { [YEAR]: 0.03, [YEAR - 1]: 0.04 }, benchMax: 0.05 },
    // STIMA — DIREZIONE (excluded from grouping since fn=DIREZIONE)
    { metrica: "MULTIPLO", tipologia: "STIMA", funzione: "DIREZIONE", anni: { [YEAR]: 4, [YEAR - 1]: 3.5 } },

    // CALCOLATO — SALES
    { metrica: "VENDITE MESE", tipologia: "CALCOLATO", funzione: "SALES", anni: {}, descCalcolo: "Vendite totali * Valore vendita media" },
    { metrica: "NUMERO VENDITE SALES", tipologia: "CALCOLATO", funzione: "SALES", anni: {}, descCalcolo: "Offerte Sales × Tasso chiusura" },
    { metrica: "NUMERO VENDITE MARKETING", tipologia: "CALCOLATO", funzione: "MARKETING", anni: {}, descCalcolo: "Offerte Marketing × Tasso chiusura" },
    { metrica: "NUMERO TOTALE VENDITE", tipologia: "CALCOLATO", funzione: "SALES", anni: {} },
    { metrica: "TOTALE OFFERTE", tipologia: "CALCOLATO", funzione: "SALES", anni: {} },
    { metrica: "TRATTATIVE SCARTO", tipologia: "CALCOLATO", funzione: "SALES", anni: {}, descCalcolo: "Offerte eccedenti capienza commerciali" },
    { metrica: "VENDITA MEDIA ANNUA PER COMMERCIALE", tipologia: "CALCOLATO", funzione: "SALES", anni: {} },
    { metrica: "COSTO ACQUISIZIONE MEDIO", tipologia: "CALCOLATO", funzione: "MARKETING", anni: {}, descCalcolo: "Budget Marketing / Vendite Marketing" },
    { metrica: "CAPACITY NECESSARIA", tipologia: "CALCOLATO", funzione: "OPERATION", anni: {} },
  ];
}

export function initEeValues(
  metrics: EeMetric[],
  year: number,
): {
  values: Record<string, number>;
  origValues: Record<string, number>;
  prevValues: Record<string, number | null>;
} {
  const values: Record<string, number> = {};
  const origValues: Record<string, number> = {};
  const prevValues: Record<string, number | null> = {};

  for (const m of metrics) {
    if (
      m.tipologia === "DA DEFINIRE" ||
      m.tipologia === "STIMA" ||
      m.tipologia === "OBIETTIVO"
    ) {
      const k = m.metrica.toUpperCase();
      const v = m.anni[year];
      const val = v !== null && v !== undefined ? v : 0;
      values[k] = val;
      origValues[k] = val;
      const pv = m.anni[year - 1];
      prevValues[k] = pv !== null && pv !== undefined ? pv : null;
    }
  }

  return { values, origValues, prevValues };
}

export function eeGroupMetrics(
  metrics: EeMetric[],
): Record<string, Record<string, EeMetric[]>> {
  const g: Record<string, Record<string, EeMetric[]>> = {};
  for (const t of EE_SECTION_ORDER) g[t] = {};

  for (const m of metrics) {
    const tip = m.tipologia;
    if (!g[tip]) continue;
    const k = m.metrica.toUpperCase();
    if (k === "CAPACITY REALE") continue;
    const fn = m.funzione || "ALTRO";
    if (fn === "DIREZIONE") continue;
    if (!g[tip][fn]) g[tip][fn] = [];
    g[tip][fn].push(m);
  }

  return g;
}
