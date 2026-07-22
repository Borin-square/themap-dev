export type SiteType = "vetrina" | "ecommerce";

export interface MktgConfig {
  siteType: SiteType;
  accounts: {
    ga4PropertyId: string;
    googleAdsValue: string;
    googleAdsManagerId: string;
    metaAccountId: string;
    tiktokAccountId: string;
    linkedinAccountId: string;
  };
  logo: {
    kind: "brand" | "upload" | "text";  // brand=riferimento a asset in brand-asset, upload=url, text=fallback
    ref: string;    // id del logo in brand-asset, oppure url, oppure testo
  };
  notes: string;
}

export function emptyMktgConfig(): MktgConfig {
  return {
    siteType: "vetrina",
    accounts: {
      ga4PropertyId: "",
      googleAdsValue: "",
      googleAdsManagerId: "",
      metaAccountId: "",
      tiktokAccountId: "",
      linkedinAccountId: "",
    },
    logo: { kind: "text", ref: "" },
    notes: "",
  };
}

// --- Report Layout ---
export type ReportSectionId =
  | "summary-bar"
  | "kpi-sito"
  | "kpi-campagne"
  | "session-overview"
  | "contatti-overview"
  | "channel-overview"
  | "landing-pages"
  | "platform-overview"
  | "objective-overview"
  | "trend-globale"
  | "kpi-website-ec"
  | "revenue-trend"
  | "funnel"
  | "top-products"
  | "channels-ec"
  | "devices"
  | "new-vs-returning"
  | "geo-country"
  | "platform-ec"
  | "objective-ec";

export interface ReportSection {
  id: ReportSectionId;
  visible: boolean;
  title?: string; // override
}

export interface ReportLayout {
  sections: ReportSection[];
  customNotes: string;
}

const VETRINA_SECTIONS: ReportSectionId[] = [
  "summary-bar",
  "kpi-sito",
  "kpi-campagne",
  "session-overview",
  "contatti-overview",
  "channel-overview",
  "landing-pages",
  "platform-overview",
  "objective-overview",
  "trend-globale",
];

const ECOMMERCE_SECTIONS: ReportSectionId[] = [
  "summary-bar",
  "kpi-website-ec",
  "revenue-trend",
  "funnel",
  "top-products",
  "channels-ec",
  "devices",
  "new-vs-returning",
  "geo-country",
  "platform-ec",
  "objective-ec",
];

export function defaultLayoutFor(siteType: SiteType): ReportLayout {
  const ids = siteType === "vetrina" ? VETRINA_SECTIONS : ECOMMERCE_SECTIONS;
  return {
    sections: ids.map((id) => ({ id, visible: true })),
    customNotes: "",
  };
}

export const SECTION_TITLES: Record<ReportSectionId, string> = {
  "summary-bar": "Investimento ADV",
  "kpi-sito": "Sito web · GA4",
  "kpi-campagne": "Campagne · Contatti",
  "session-overview": "Sessioni",
  "contatti-overview": "Contatti da campagna",
  "channel-overview": "Canali",
  "landing-pages": "Landing page",
  "platform-overview": "Spesa per piattaforma",
  "objective-overview": "Spesa per obiettivo",
  "trend-globale": "Trend globale",
  "kpi-website-ec": "Website · GA4",
  "revenue-trend": "Entrate · trend",
  "funnel": "Funnel",
  "top-products": "Top prodotti",
  "channels-ec": "Canali",
  "devices": "Device",
  "new-vs-returning": "New vs Returning",
  "geo-country": "Geo · paesi",
  "platform-ec": "Spesa per piattaforma",
  "objective-ec": "Spesa per obiettivo",
};
