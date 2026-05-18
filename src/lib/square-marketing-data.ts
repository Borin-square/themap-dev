import type { FwData, FwConfig } from "./flywheel";
import type { Campaign } from "./marketing";
import type { Persona } from "./people";

/* Data imported from THE MAP (Google Apps Script) */
/** Bump this when default data changes to invalidate cached versions */
export const SQUARE_DATA_VERSION = 2;

/** Returns data version for a company slug (undefined = no versioning) */
export function dataVersion(slug: string): number | undefined {
  return slug === "square-marketing" ? SQUARE_DATA_VERSION : undefined;
}

export function getSquarePeople(): Persona[] {
  return [
    { nome: "Alessandra Marafetti", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Michele Buoso", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "GODIN", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Stefano Rizzo", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Alice Martelloni", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Beatrice Tardiani", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Riccardo Claudi", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "JUNIOR", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Alessandra Ziviani", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Vania Rigon", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "FRANK", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Nicholas Ferrari", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Fabio Zanoncello", azienda: "SQUARE MARKETING", funzione: "SALES", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Rebecca Mantoanello", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Federico Montresor", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "KOTLER", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Alessia Lorenzetto", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "JUNIOR", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Fabio Giacomello", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "FREELANCE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Silvia Cenci", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "FRANK", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Manuel Sgrazzutti", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Marco Gonella", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Sara Crepaldi", azienda: "SQUARE MARKETING", funzione: "SALES", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Viviana Menin", azienda: "SQUARE MARKETING", funzione: "AMMINISTRAZIONE", livello: "MIDDLE", contratto: "DIPENDENTE", team: "", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Paola Soldi", azienda: "SQUARE MARKETING", funzione: "AMMINISTRAZIONE", livello: "MIDDLE", contratto: "DIPENDENTE", team: "", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Anna Mirandola", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "FREELANCE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Elia Signorato", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Luca Calzolari", azienda: "SQUARE MARKETING", funzione: "SALES", livello: "JUNIOR", contratto: "DIPENDENTE", team: "", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Giovanni Solimeno", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "FRANK", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Nicola Ferrari", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Giuseppe Vivaldi", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "GODIN", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Michele Gelmini", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "FRANK", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Davide Zago", azienda: "SQUARE MARKETING", funzione: "AMMINISTRAZIONE", livello: "MIDDLE", contratto: "DIPENDENTE", team: "", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Alessia Tezza", azienda: "SQUARE MARKETING", funzione: "SALES", livello: "JUNIOR", contratto: "DIPENDENTE", team: "", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Borin Nicholas", azienda: "SQUARE MARKETING", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Edoardo Rossignoli", azienda: "SQUARE MARKETING", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Giovanni Bergamini", azienda: "SQUARE MARKETING", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: true, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Thomas Ferrari", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "KOTLER", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Chiara Fenzi", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "FRANK", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
    { nome: "Emma Pecirep", azienda: "SQUARE MARKETING", funzione: "AMMINISTRAZIONE", livello: "JUNIOR", contratto: "DIPENDENTE", team: "", leader: false, anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } } },
  ];
}

export function getSquareFwData(): { data: FwData; config: FwConfig } {
  const data: FwData = {
    MARKETING: {
      "POSIZIONE SU DIRECTORY": {
        owner: "NICOLA FERRARI", isPercent: false, isCurrency: false,
        real: [2, 2, 1.9, 2.07, null, null, null, null, null, null, null, null],
        forecast: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
        subgoals: {},
      },
      "TRAFFICO SITO": {
        owner: "N. Ferrari", isPercent: false, isCurrency: false,
        real: [1800, 1800, 1700, 1200, null, null, null, null, null, null, null, null],
        forecast: [1800, 1800, 1800, 1890, 1984.5, 2083.72, 2187.91, 2297.31, 2412.17, 2532.78, 2659.42, 2792.39],
        subgoals: {},
      },
      "TOTALE OFFERTE": {
        owner: "F. Zanoncello", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "FONTE MARKETING": { owner: "N. Ferrari", isPercent: false, isCurrency: false, real: [38, 29, 36, 38, null, null, null, null, null, null, null, null], forecast: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60] },
          "FONTE SALES": { owner: "F. Zanoncello", isPercent: false, isCurrency: false, real: [30, 20, 32, 19, null, null, null, null, null, null, null, null], forecast: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20] },
        },
      },
    },
    SALES: {
      "TASSO DI CHIUSURA": {
        owner: "F. Zanoncello", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "FONTE SALES": { owner: "N. Ferrari", isPercent: false, isCurrency: false, real: [0.26, 0.26, 0.2, 0.07, null, null, null, null, null, null, null, null], forecast: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25] },
          "FONTE MARKETING": { owner: "F. Zanoncello", isPercent: false, isCurrency: false, real: [0.12, 0.2, 0.11, 0.1, null, null, null, null, null, null, null, null], forecast: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
        },
      },
      "VENDITA MEDIA": {
        owner: "F. Zanoncello", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "FONTE SALES": { owner: "F. Zanoncello", isPercent: false, isCurrency: false, real: [10511, 6276, 6285, 1485, null, null, null, null, null, null, null, null], forecast: [12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500] },
          "FONTE MARKETING": { owner: "F. Zanoncello", isPercent: false, isCurrency: false, real: [16844, 9210, 7770, 10582, null, null, null, null, null, null, null, null], forecast: [12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500, 12500] },
        },
      },
      "TOTALE VENDITE": {
        owner: "F. Zanoncello", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "SALES TEAM": { owner: "F. Zanoncello", isPercent: false, isCurrency: false, real: [330000, 140000, 98400, 45320, null, null, null, null, null, null, null, null], forecast: [189000, 189000, 189000, 189000, 189000, 189000, 189000, 189000, 189000, 189000, 189000, 189000] },
        },
      },
    },
    OPERATION: {
      "DELTA RICORRENTE": {
        owner: "G. Solimeno", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "GODIN": { owner: "M. Buoso", isPercent: false, isCurrency: false, real: [6365, 2662, 859, -3345, null, null, null, null, null, null, null, null], forecast: [null, null, null, null, null, null, null, null, null, null, null, null] },
          "KOTLER": { owner: "F. Montresor", isPercent: false, isCurrency: false, real: [3719, null, -3857, -2348, null, null, null, null, null, null, null, null], forecast: [null, null, null, null, null, null, null, null, null, null, null, null] },
          "FRANK": { owner: "G. Solimeno", isPercent: false, isCurrency: false, real: [null, null, 1483, null, null, null, null, null, null, null, null, null], forecast: [null, null, null, null, null, null, null, null, null, null, null, null] },
        },
      },
      "ORE SU ORE": {
        owner: "G. Solimeno", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "GODIN": { owner: "M. Buoso", isPercent: false, isCurrency: false, real: [1.05, 1.05, 1.05, 1.03, null, null, null, null, null, null, null, null], forecast: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
          "KOTLER": { owner: "F. Montresor", isPercent: false, isCurrency: false, real: [0.98, 0.98, 0.98, 0.91, null, null, null, null, null, null, null, null], forecast: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
          "FRANK": { owner: "G. Solimeno", isPercent: false, isCurrency: false, real: [0.93, 0.93, 0.93, 0.93, null, null, null, null, null, null, null, null], forecast: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
        },
      },
      "ADVOCACY": {
        owner: "N. Ferrari", isPercent: false, isCurrency: false,
        real: [null, null, null, null, null, null, null, null, null, null, null, null],
        forecast: [null, null, null, null, null, null, null, null, null, null, null, null],
        subgoals: {
          "CASI STUDIO": { owner: "N. Ferrari", isPercent: false, isCurrency: false, real: [1, 4, 2, 2, null, null, null, null, null, null, null, null], forecast: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
          "RECENSIONI": { owner: "N. Ferrari", isPercent: false, isCurrency: false, real: [null, null, null, null, null, null, null, null, null, null, null, null], forecast: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
        },
      },
    },
    DIREZIONE: {
      "FATTURATO": {
        owner: "N. BORIN", isPercent: false, isCurrency: false,
        real: [197145, 212653, 156655, 169000, null, null, null, null, null, null, null, null],
        forecast: [179072.91, 184410.73, 189588.4, 194610.75, 199482.43, 204207.96, 208791.72, 213237.97, 217550.83, 221734.3, 225792.27, 229728.51],
        subgoals: {},
      },
      "M.O.L.": {
        owner: "N. BORIN", isPercent: false, isCurrency: false,
        real: [93145, 27653, -46345, null, null, null, null, null, null, null, null, null],
        forecast: [10000, 15000, 20000, 45751.59, 43080.64, 51066.16, 16584.76, 37894.03, 68230.05, 68665.04, 72277.56, 38186.51],
        subgoals: {},
      },
      "CASSA": {
        owner: "D. Zago", isPercent: false, isCurrency: false,
        real: [115000, -19000, -27500, -46411, null, null, null, null, null, null, null, null],
        forecast: [10000, 15000, 20000, 45751.59, 43080.64, 51066.16, 16584.76, 37894.03, 68230.05, 68665.04, 72277.56, 38186.51],
        subgoals: {},
      },
    },
    AMMINISTRAZIONE: {
      "COSTI TOTALI": {
        owner: "", isPercent: false, isCurrency: false,
        real: [104000, 185000, 203000, null, null, null, null, null, null, null, null, null],
        forecast: [188453.68, 209229.96, 182664.57, 148859.16, 156401.79, 153141.8, 192206.96, 175343.94, 149320.78, 153069.26, 153514.71, 191542],
        subgoals: {},
      },
    },
  };

  const config: FwConfig = {
    "POSIZIONE SU DIRECTORY": { mode: "PARTENZA", start: 10.0 },
    "TRAFFICO SITO": { mode: "STANDARD" },
    "TOTALE OFFERTE": { mode: "STANDARD" },
    "TASSO DI CHIUSURA": { mode: "STANDARD" },
    "VENDITA MEDIA": { mode: "STANDARD" },
    "TOTALE VENDITE": { mode: "STANDARD" },
    "DELTA RICORRENTE": { mode: "LIMITI", limInf: -300.0, limSup: 300.0 },
    "ORE SU ORE": { mode: "INVERSO", limInf: 1.05, limSup: 1.0 },
    "ADVOCACY": { mode: "STANDARD" },
    "FATTURATO": { mode: "STANDARD" },
    "M.O.L.": { mode: "STANDARD" },
    "CASSA": { mode: "STANDARD" },
    "COSTI TOTALI": { mode: "INVERSO" },
  };

  return { data, config };
}

export function getSquareCampaigns(): Campaign[] {
  return [
    {
      id: "36eb55bc-0bca-4c7f-a14a-654d7aab843f", nome: "WorldWide | Italian Agency", piattaforma: "Google Ads", canale: "Search",
      obiettivo: "Lead gen", stato: "ATTIVA", data_inizio: "2026-03-12T23:00:00.000Z", data_fine: "2026-06-29T22:00:00.000Z",
      target: "Generico - Worldwide", landing_page: "https://squaremarketing.it/", note: "",
      periodi: {},
    },
    {
      id: "23ae0778-1eb8-4dca-b3ac-a2e168c7f06b", nome: "Digital strategy IT", piattaforma: "Google Ads", canale: "Search",
      obiettivo: "Lead Gen", stato: "ATTIVA", data_inizio: "2026-04-17T22:00:00.000Z", data_fine: "2026-06-29T22:00:00.000Z",
      target: "Italy", landing_page: "https://squaremarketing.it/servizio/marketing-strategy/", note: "",
      periodi: {
        ROAS: [null, null, null, null, null, null, null, null, null, null, null, null],
        LEAD_RE: [null, null, null, null, null, null, null, null, null, null, null, null],
        IMPRESSIONI: [null, null, null, 192, null, null, null, null, null, null, null, null],
        BUDGET_RE: [null, null, null, 60, null, null, null, null, null, null, null, null],
        LEAD_FC: [null, null, null, 8, null, null, null, null, null, null, null, null],
        BUDGET_FC: [null, null, null, 900, null, null, null, null, null, null, null, null],
        CLICK: [null, null, null, 45, null, null, null, null, null, null, null, null],
      },
    },
    {
      id: "7d25e71b-9bc8-43b2-873a-af3cec408bc0", nome: "Sortlist - Campagna Visibilità - Italy - all services", piattaforma: "Altro", canale: "Altro",
      obiettivo: "Lead Gen", stato: "ATTIVA", data_inizio: "2025-12-31T23:00:00.000Z", data_fine: "2026-12-30T23:00:00.000Z",
      target: "Italia", landing_page: "https://squaremarketing.it/", note: "",
      periodi: {
        BUDGET_FC: [6600, 6600, 6600, 6600, 6600, 6600, 6600, 6600, 6600, 6600, 6600, 6600],
        LEAD_FC: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      },
    },
    {
      id: "c26898d7-3857-4e08-9eac-c865557e6593", nome: "0 volume strategy | branding Agritech", piattaforma: "SEO", canale: "Content",
      obiettivo: "Brand", stato: "PIANIFICATA", data_inizio: "2026-05-31T22:00:00.000Z", data_fine: "",
      target: "Aziende agritech", landing_page: "", note: "Pagina Nodo Comprare link su whitepress",
      periodi: {
        LEAD_FC: [null, null, null, null, null, null, null, 2, 2, 2, 2, 2],
        BUDGET_FC: [null, null, null, null, null, null, 100, null, 100, 100, 100, 100],
      },
    },
    {
      id: "ae4d228f-a443-42b3-8de8-b3831a61c88b", nome: "Visibilità Italia", piattaforma: "Sortlist", canale: "Content",
      obiettivo: "Visibilità", stato: "ATTIVA", data_inizio: "", data_fine: "",
      target: "", landing_page: "", note: "Dati aggregati da Sortlist - pagine Italia (sortlist.it + location IT)",
      periodi: {},
    },
    {
      id: "9486daa6-537f-470e-b965-1c293d3a97ae", nome: "Visibilità World", piattaforma: "Sortlist", canale: "Content",
      obiettivo: "Visibilità", stato: "ATTIVA", data_inizio: "", data_fine: "",
      target: "", landing_page: "", note: "Dati aggregati da Sortlist - pagine internazionali",
      periodi: {},
    },
  ];
}

export interface ToolItem {
  id: number;
  label: string;
  url: string;
  desc: string;
  funzione: string;
}

export function getSquareTools(): ToolItem[] {
  return [
    { id: 1, label: "MARKETING DASHBOARD", url: "https://app-eu1.hubspot.com/reports-dashboard/25765022/view/111115780", desc: "", funzione: "MARKETING" },
    { id: 2, label: "SALES DASHBOARD", url: "https://app-eu1.hubspot.com/reports-dashboard/25765022/view/111115780", desc: "", funzione: "SALES" },
    { id: 3, label: "OPERATION CONSOLE", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbyvkxGxOIEjvgNdRHFvC29DhBhTl2Anz2DAgpjlEkZW/dev", desc: "", funzione: "OPERATION" },
    { id: 4, label: "COSTI RICAVI", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbwTFI96np50EngiIPrPiCNnBMRHqdANYNv0-kUQDmVG8hMFOwomF2gYmZLVTYKirEonig/exec", desc: "tracking entrate/uscite banca e carte", funzione: "AMMINISTRAZIONE" },
    { id: 5, label: "CROSSROADS", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbxop2tOHx9GocXirGCOANinabA_TI8tQhGAKJO2KqGboTXUyg3M08HTN0Twh_aVKWwXZg/exec", desc: "Scostamento tra dipendenti in cloud e workload asana", funzione: "AMMINISTRAZIONE" },
    { id: 6, label: "CREDIT FLOW", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbxe6dBPT6halv2hYTGmZJETV9zAZ_8T712IuCzGk-xlaJL_vcSlGCp4QTgMX17AWWxhxA/exec", desc: "tool di calendarizzazione azioni da eseguire per recupero crediti", funzione: "AMMINISTRAZIONE" },
    { id: 7, label: "SCADENZIARIO HUBSPOT", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbx1hP3Az8ldMPORr67nDQ2Ha20hUApdjEzNQtqvwQf_fQG1yZVVPH6c9frLdfvZF8TpYw/exec", desc: "tool di calendarizzazione/monitoring rate fatturazione attiva", funzione: "AMMINISTRAZIONE" },
    { id: 8, label: "SCADENZIARIO", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbwXIoOHd_p9N0w9D5_3-t1D4S_gP_S_ZO4zfEsjuM1rkNV_kcExNjbiT0CcsnTr3hIn/exec", desc: "scadenziario fatture emesse (scadenziario incassi clienti)", funzione: "AMMINISTRAZIONE" },
    { id: 9, label: "MICROTOOLS", url: "http://192.168.1.254:8080/", desc: "", funzione: "AMMINISTRAZIONE" },
    { id: 10, label: "Gestione attrezzatura", url: "https://script.google.com/a/macros/squaremarketing.it/s/AKfycbwZWsPY8ib7NlUqrBWhq95COL7wWohTu2WkPjRQMbsIxQxuZ0U3rfErNtvItCHieZ0oxA/exec", desc: "", funzione: "" },
    { id: 11, label: "Sorlist tracker V2", url: "https://docs.google.com/spreadsheets/d/1_uKWDk58kNvSW3GsI5jUsuzJUXCTibCzzpmlwEomUe4/edit?gid=1076170372#gid=1076170372", desc: "", funzione: "MARKETING" },
    { id: 12, label: "Libreria Markdown", url: "https://claude.ai/public/artifacts/c0afd283-333b-41db-b15e-c4526c73ebf3", desc: "", funzione: "" },
  ];
}

export interface BudgetItem {
  id: string;
  attivita: string;
  spesa_fc: number | null;
  spesa_re: number | null;
  effort: number | null;
  commenti: string;
  is_group: boolean;
  parent_gid: string;
  group_id: string;
}

export function getSquareBudget(): BudgetItem[] {
  return [
    { id: "b1", attivita: "Meta Ads", spesa_fc: 9000, spesa_re: null, effort: null, commenti: "", is_group: false, parent_gid: "98307d94-7560-4e6f-bcf3-e8778e725f4b", group_id: "" },
    { id: "b2", attivita: "Google Ads", spesa_fc: 9000, spesa_re: null, effort: null, commenti: "", is_group: false, parent_gid: "98307d94-7560-4e6f-bcf3-e8778e725f4b", group_id: "" },
    { id: "b3", attivita: "Linkedin Ads", spesa_fc: 9000, spesa_re: null, effort: null, commenti: "", is_group: false, parent_gid: "98307d94-7560-4e6f-bcf3-e8778e725f4b", group_id: "" },
    { id: "b4", attivita: "Il sole 24 ore", spesa_fc: 6000, spesa_re: 5000, effort: null, commenti: "", is_group: false, parent_gid: "cd31d1be-929e-480d-ac11-ea17888fd33f", group_id: "" },
    { id: "b5", attivita: "Nuova attività", spesa_fc: null, spesa_re: null, effort: null, commenti: "", is_group: false, parent_gid: "cd31d1be-929e-480d-ac11-ea17888fd33f", group_id: "" },
    { id: "b6", attivita: "Media", spesa_fc: null, spesa_re: null, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "98307d94-7560-4e6f-bcf3-e8778e725f4b" },
    { id: "b7", attivita: "Partnership", spesa_fc: null, spesa_re: null, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "cd31d1be-929e-480d-ac11-ea17888fd33f" },
    { id: "b8", attivita: "Pr/ Link", spesa_fc: null, spesa_re: null, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "5213c0dd-a829-4305-9a94-dce6a961619a" },
    { id: "b9", attivita: "Engage", spesa_fc: 2000, spesa_re: null, effort: null, commenti: "", is_group: false, parent_gid: "5213c0dd-a829-4305-9a94-dce6a961619a", group_id: "" },
    { id: "b10", attivita: "Meet the Agency", spesa_fc: 2000, spesa_re: 2000, effort: null, commenti: "", is_group: false, parent_gid: "5213c0dd-a829-4305-9a94-dce6a961619a", group_id: "" },
  ];
}
