import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import { sectionsToDraft } from "@/lib/page-generator";
import type { PgPage, PgProject, PgSection, PgAuthor, PgCaseStudy } from "@/lib/page-generator";

export const maxDuration = 120;

const SUGGEST_TOOL = {
  name: "suggest_kg_extras",
  description: "Suggerisce quali blocchi schema.org aggiuntivi includere e ne fornisce il contenuto.",
  input_schema: {
    type: "object" as const,
    properties: {
      include_faq: { type: "boolean", description: "True se il contenuto giustifica un FAQPage" },
      faq: {
        type: "array",
        description: "Solo se include_faq=true",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
          },
          required: ["question", "answer"],
        },
      },
      include_howto: { type: "boolean", description: "True se il contenuto è una guida step-by-step" },
      howto_name: { type: "string" },
      howto_steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            text: { type: "string" },
          },
          required: ["name", "text"],
        },
      },
      article_description: {
        type: "string",
        description: "Descrizione ricca per schema Article (150-300 caratteri)",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keyword/entità principali della pagina",
      },
    },
    required: ["include_faq", "include_howto", "article_description", "keywords"],
  },
};

/* POST /api/page-generator/pages/[id]/build-kg
   Body: { version_no?: number, site_url?: string, org_name?: string, org_url?: string, org_logo?: string } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as {
    version_no?: number;
    site_url?: string;
    org_name?: string;
    org_url?: string;
    org_logo?: string;
  };
  const svc = createServiceClient();

  const { data: page, error: pageErr } = await svc
    .from("pg_pages").select("*").eq("id", id).single<PgPage>();
  if (pageErr || !page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 });

  const { data: project, error: projErr } = await svc
    .from("pg_projects").select("*").eq("id", page.project_id).single<PgProject>();
  if (projErr || !project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  const versionQuery = svc.from("pg_page_versions").select("*").eq("page_id", id);
  const { data: version } = body.version_no
    ? await versionQuery.eq("version_no", body.version_no).single<{ id: string; sections: PgSection[]; draft_text: string | null }>()
    : await versionQuery.order("version_no", { ascending: false }).limit(1).single<{ id: string; sections: PgSection[]; draft_text: string | null }>();

  if (!version) return NextResponse.json({ error: "Nessuna versione trovata" }, { status: 400 });

  // Autori e casi studio della pagina
  const authors: PgAuthor[] = page.author_ids.length > 0
    ? (await svc.from("pg_authors").select("*").in("id", page.author_ids)).data ?? []
    : [];
  const cases: PgCaseStudy[] = page.case_study_ids.length > 0
    ? (await svc.from("pg_case_studies").select("*").in("id", page.case_study_ids)).data ?? []
    : [];

  const draftText = version.draft_text || sectionsToDraft(version.sections);
  const sections = version.sections ?? [];

  // Chiedo a Claude di suggerire i blocchi extra (FAQ, HowTo) + description arricchita
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const suggestResp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [SUGGEST_TOOL],
    tool_choice: { type: "tool", name: "suggest_kg_extras" },
    messages: [{
      role: "user",
      content: [
        `Analizza questa pagina e suggerisci il Knowledge Graph.`,
        `KW principale: ${page.kw_main}`,
        page.kw_secondary.length > 0 ? `KW secondarie: ${page.kw_secondary.join(", ")}` : "",
        `Intent: ${page.search_intent || "non specificato"}`,
        `Meta description: ${page.meta_description || "assente"}`,
        ``,
        `BOZZA (per capire se contiene FAQ e/o step guidati):`,
        draftText.slice(0, 8000),
      ].filter(Boolean).join("\n"),
    }],
  });

  const suggest = suggestResp.content.find((b) => b.type === "tool_use");
  const extras = suggest && suggest.type === "tool_use"
    ? suggest.input as {
        include_faq: boolean;
        faq?: Array<{ question: string; answer: string }>;
        include_howto: boolean;
        howto_name?: string;
        howto_steps?: Array<{ name: string; text: string }>;
        article_description: string;
        keywords: string[];
      }
    : { include_faq: false, include_howto: false, article_description: page.meta_description || "", keywords: [] };

  const siteUrl = body.site_url || project.drive_folder_url?.split("/")[2] || "";
  const pageUrl = siteUrl && page.slug ? `${siteUrl}/${page.slug}` : "";
  const now = new Date().toISOString();

  // Costruzione @graph
  const graph: Record<string, unknown>[] = [];

  const orgId = body.org_url ? `${body.org_url}#organization` : "#organization";
  if (body.org_name || body.org_url) {
    graph.push({
      "@type": "Organization",
      "@id": orgId,
      name: body.org_name || undefined,
      url: body.org_url || undefined,
      logo: body.org_logo || undefined,
    });
  }

  // Persons (autori)
  const personIds: string[] = [];
  authors.forEach((a) => {
    const personId = a.linkedin_url || (siteUrl ? `${siteUrl}/#/${a.name.replace(/\s+/g, "-").toLowerCase()}` : `#author-${a.id}`);
    personIds.push(personId);
    graph.push({
      "@type": "Person",
      "@id": personId,
      name: a.name,
      jobTitle: a.role || undefined,
      description: a.bio || undefined,
      image: a.photo_url || undefined,
      sameAs: [
        a.linkedin_url,
        ...(a.same_as ?? []),
      ].filter(Boolean),
    });
  });

  // Breadcrumb (Home > Pagina)
  if (siteUrl) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": pageUrl ? `${pageUrl}#breadcrumb` : "#breadcrumb",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        {
          "@type": "ListItem",
          position: 2,
          name: page.title || page.kw_main,
          item: pageUrl || undefined,
        },
      ],
    });
  }

  // Article principale
  graph.push({
    "@type": "Article",
    "@id": pageUrl ? `${pageUrl}#article` : "#article",
    headline: page.title || page.kw_main,
    description: extras.article_description,
    inLanguage: "it-IT",
    keywords: [page.kw_main, ...page.kw_secondary, ...(extras.keywords ?? [])].filter(Boolean).join(", "),
    author: personIds.length > 0 ? personIds.map((pid) => ({ "@id": pid })) : undefined,
    publisher: body.org_name || body.org_url ? { "@id": orgId } : undefined,
    datePublished: now,
    dateModified: now,
    mainEntityOfPage: pageUrl ? { "@id": pageUrl } : undefined,
    articleSection: sections.filter((s) => s.title !== "Introduzione").map((s) => s.title),
    mentions: cases.map((c) => ({
      "@type": "CreativeWork",
      name: c.title,
      about: c.summary || undefined,
      url: c.url || undefined,
    })).filter((m) => m.name),
  });

  // FAQPage
  if (extras.include_faq && extras.faq && extras.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": pageUrl ? `${pageUrl}#faq` : "#faq",
      mainEntity: extras.faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  // HowTo
  if (extras.include_howto && extras.howto_steps && extras.howto_steps.length > 0) {
    graph.push({
      "@type": "HowTo",
      "@id": pageUrl ? `${pageUrl}#howto` : "#howto",
      name: extras.howto_name || page.title || page.kw_main,
      step: extras.howto_steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    });
  }

  const kg = {
    "@context": "https://schema.org",
    "@graph": graph.map((node) => stripUndefined(node)),
  };

  await svc.from("pg_page_versions").update({ kg_json: kg }).eq("id", version.id);
  await svc.from("pg_pages").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ kg, extras });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      const arr = v.filter((x) => x !== undefined && x !== null && x !== "");
      if (arr.length > 0) out[k] = arr;
    } else if (v !== null && v !== "") {
      out[k] = v;
    }
  }
  return out as T;
}
