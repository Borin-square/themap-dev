"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { BrandConfig, BrandColor, BrandFont, BrandBlock, BlockType } from "@/lib/marketing";
import { emptyBrandConfig, BLOCK_CATEGORIES, emptyBlock } from "@/lib/marketing";

type Mode = "view" | "build";

/** Loads Google Fonts dynamically + registers custom @font-face */
function GoogleFontsLoader({ fonts }: { fonts: BrandFont[] }) {
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Google Fonts (fonts without custom url)
    const googleFonts = fonts.filter((f) => !f.url);
    if (googleFonts.length > 0) {
      const families = googleFonts.map((f) => f.name.replace(/ /g, "+") + ":wght@100;200;300;400;500;600;700;800;900").join("&family=");
      const href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
        cleanups.push(() => link.remove());
      }
    }

    // Custom uploaded fonts (@font-face)
    const customFonts = fonts.filter((f) => f.url);
    if (customFonts.length > 0) {
      const css = customFonts.map((f) => `@font-face { font-family: '${f.name}'; src: url('${f.url}'); font-display: swap; }`).join("\n");
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      cleanups.push(() => style.remove());
    }

    return () => { cleanups.forEach((fn) => fn()); };
  }, [fonts]);
  return null;
}

/** Ensures loaded data conforms to BrandConfig, migrating old formats */
function sanitizeBrand(raw: unknown): BrandConfig {
  const base = emptyBrandConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    brandName: typeof r.brandName === "string" ? r.brandName : base.brandName,
    tagline: typeof r.tagline === "string" ? r.tagline : base.tagline,
    logos: Array.isArray(r.logos) ? r.logos.filter((l: any) => l && typeof l.url === "string" && !l.url.startsWith("data:")) : [],
    logoGuidelines: typeof r.logoGuidelines === "string" ? r.logoGuidelines : base.logoGuidelines,
    colors: Array.isArray(r.colors) ? r.colors : [],
    fonts: Array.isArray(r.fonts) ? r.fonts : [],
    images: Array.isArray(r.images) ? r.images.filter((i: any) => i && typeof i.url === "string" && !i.url.startsWith("data:")) : [],
    sections: Array.isArray(r.sections) ? r.sections.map((s: any) => ({
      ...s,
      images: Array.isArray(s.images) ? s.images.filter((u: any) => typeof u === "string" && !u.startsWith("data:")) : [],
      blocks: Array.isArray(s.blocks) ? s.blocks : [],
    })) : [],
  };
}

export default function BrandAssetPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [rawBrand, setRawBrand] = useLocalState<BrandConfig>(
    `themap:${slug}:brandAsset`, emptyBrandConfig,
  );
  const brand = sanitizeBrand(rawBrand);
  const setBrand: typeof setRawBrand = (v) => {
    if (typeof v === "function") setRawBrand((p) => sanitizeBrand((v as (prev: BrandConfig) => BrandConfig)(sanitizeBrand(p))));
    else setRawBrand(sanitizeBrand(v));
  };
  const [mode, setMode] = useState<Mode>("view");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company", slug);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Upload fallito"); return null; }
      return data.url;
    } catch {
      showToast("Errore di connessione");
      return null;
    }
  }, [slug]);

  return (
    <div>
      <GoogleFontsLoader fonts={brand.fonts} />
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <span className="ee-tab active">Brand Asset</span>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
        <Link href={`/${slug}/marketing/page-generator`} className="ee-tab">Page Generator</Link>
        <Link href={`/${slug}/marketing/design-test`} className="ee-tab">Design Test</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      {/* Mode toggle */}
      <div className="ba-mode-bar">
        <button className={mode === "view" ? "act" : ""} onClick={() => setMode("view")}>Viewer</button>
        <button className={mode === "build" ? "act" : ""} onClick={() => setMode("build")}>Builder</button>
      </div>

      {mode === "build" ? (
        <BuilderMode brand={brand} setBrand={setBrand} upload={upload} showToast={showToast} companyName={company?.name || slug} />
      ) : (
        <ViewerMode brand={brand} companyColor={company?.color} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   VIEWER MODE
   ════════════════════════════════════════════════════ */

function ViewerMode({ brand: b, companyColor }: { brand: BrandConfig; companyColor?: string }) {
  const hasBlocks = b.sections.some((s) => (s.blocks?.length ?? 0) > 0);
  const empty = !b.brandName && b.logos.length === 0 && b.colors.length === 0 && b.fonts.length === 0 && !hasBlocks;

  if (empty) {
    return (
      <div className="ba-view-empty">
        <div className="ba-view-empty-icon">{"\u2B21"}</div>
        <p>Nessun brand asset configurato.</p>
        <p>Passa al <strong>Builder</strong> per iniziare.</p>
      </div>
    );
  }

  return (
    <div className="ba-view">
      {/* Cover */}
      {(b.brandName || b.tagline) && (
        <div className="ba-v-cover" style={{ borderLeftColor: companyColor || "var(--accent)" }}>
          {b.brandName && <h1 className="ba-v-brand">{b.brandName}</h1>}
          {b.tagline && <p className="ba-v-tagline">{b.tagline}</p>}
        </div>
      )}

      {/* Logo */}
      {b.logos.length > 0 && (
        <div className="ba-v-section">
          <h2>Logo</h2>
          <div className="ba-v-logo-grid">
            {b.logos.map((l) => (
              <div key={l.id} className="ba-v-logo-card">
                <img src={l.url} alt={l.name} />
                <div className="ba-v-logo-meta">
                  <span>{l.name}</span>
                  {l.variant && <em>{l.variant}</em>}
                </div>
              </div>
            ))}
          </div>
          {b.logoGuidelines && <div className="ba-v-guidelines">{b.logoGuidelines}</div>}
        </div>
      )}

      {/* Colors */}
      {b.colors.length > 0 && (
        <div className="ba-v-section">
          <h2>Colori</h2>
          {/* Palette bar */}
          <div className="ba-v-palette-bar">
            {b.colors.map((c) => (
              <div
                key={c.id}
                className="ba-v-palette-seg"
                style={{ background: c.hex, flex: c.percentage || 1 }}
                title={`${c.name} ${c.percentage ? c.percentage + "%" : ""}`}
              />
            ))}
          </div>
          <div className="ba-v-color-grid">
            {b.colors.map((c) => (
              <div key={c.id} className="ba-v-color">
                <div className="ba-v-swatch" style={{ background: c.hex }} />
                <strong>{c.name}</strong>
                {c.percentage != null && <span className="ba-v-color-pct">{c.percentage}%</span>}
                <code>{c.hex}</code>
                {c.usage && <span>{c.usage}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Typography */}
      {b.fonts.length > 0 && (
        <div className="ba-v-section">
          <h2>Tipografia</h2>
          <div className="ba-v-font-list">
            {b.fonts.map((f) => (
              <div key={f.id} className="ba-v-font">
                <div className="ba-v-font-sample" style={{ fontFamily: f.name }}>
                  Aa Bb Cc Dd Ee Ff Gg Hh
                </div>
                <div className="ba-v-font-meta">
                  <strong>{f.name}</strong>
                  {f.weight && <span>{f.weight}</span>}
                  {f.usage && <em>{f.usage}</em>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media */}
      {b.images.length > 0 && (
        <div className="ba-v-section">
          <h2>Media</h2>
          <div className="ba-v-img-grid">
            {b.images.map((img) => (
              <div key={img.id} className="ba-v-img">
                <img src={img.url} alt={img.name} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections with blocks */}
      {b.sections.map((s) => (
        <div key={s.id} className="ba-v-section">
          {s.title && <h2>{s.title}</h2>}
          {s.content && <div className="ba-v-text">{s.content}</div>}
          {(s.images?.length ?? 0) > 0 && (
            <div className="ba-v-img-grid">
              {s.images!.map((url, idx) => (
                <div key={idx} className="ba-v-img">
                  <img src={url} alt="" />
                </div>
              ))}
            </div>
          )}
          {(s.blocks?.length ?? 0) > 0 && (
            <div className="blk-render">
              {s.blocks!.map((block) => <BlockRenderer key={block.id} block={block} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Block Renderer (Viewer) ── */

function BlockRenderer({ block }: { block: BrandBlock }) {
  const d = block.data as Record<string, string | number | string[] | { title: string; content: string }[] | { label: string; content: string }[]>;
  switch (block.type) {
    case "heading": {
      const level = (d.level as number) || 2;
      if (level === 1) return <h1 className="blk-heading">{(d.text as string) || "Heading"}</h1>;
      if (level === 3) return <h3 className="blk-heading">{(d.text as string) || "Heading"}</h3>;
      if (level === 4) return <h4 className="blk-heading">{(d.text as string) || "Heading"}</h4>;
      return <h2 className="blk-heading">{(d.text as string) || "Heading"}</h2>;
    }
    case "text":
    case "paragraph":
      return <p className="blk-paragraph">{(d.text as string) || ""}</p>;
    case "button":
      return (
        <a href={(d.url as string) || "#"} target="_blank" rel="noreferrer"
          className={`blk-button ${d.variant === "secondary" ? "blk-btn-sec" : ""}`}>
          {(d.text as string) || "Button"}
        </a>
      );
    case "image":
      return (
        <figure className="blk-image">
          {d.url && <img src={d.url as string} alt={(d.alt as string) || ""} />}
          {d.caption && <figcaption>{d.caption as string}</figcaption>}
        </figure>
      );
    case "video":
      return (
        <figure className="blk-video">
          {d.url && <video src={d.url as string} controls />}
          {d.caption && <figcaption>{d.caption as string}</figcaption>}
        </figure>
      );
    case "audio":
      return (
        <figure className="blk-audio">
          {d.url && <audio src={d.url as string} controls />}
          {d.caption && <figcaption>{d.caption as string}</figcaption>}
        </figure>
      );
    case "spacer":
      return <div className="blk-spacer" style={{ height: (d.height as number) || 40 }} />;
    case "divider":
      return <hr className="blk-divider" />;
    case "icon":
      return <span className="blk-icon" style={{ fontSize: (d.size as number) || 24 }}>{(d.name as string) || "\u2605"}</span>;
    case "embed":
      if (d.html) return <div className="blk-embed" dangerouslySetInnerHTML={{ __html: d.html as string }} />;
      if (d.url) return <iframe className="blk-embed-frame" src={d.url as string} />;
      return null;
    case "hero":
      return (
        <div className="blk-hero" style={{ background: (d.bgColor as string) || "var(--bg2)", backgroundImage: d.bgUrl ? `url(${d.bgUrl})` : undefined }}>
          {d.title && <h1>{d.title as string}</h1>}
          {d.subtitle && <p>{d.subtitle as string}</p>}
        </div>
      );
    case "card":
      return (
        <div className="blk-card">
          {d.imageUrl && <img src={d.imageUrl as string} alt="" />}
          {d.title && <h3>{d.title as string}</h3>}
          {d.text && <p>{d.text as string}</p>}
        </div>
      );
    case "list":
      return (
        <ul className="blk-list">
          {((d.items as string[]) || []).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    case "accordion":
      return (
        <div className="blk-accordion">
          {((d.items as { title: string; content: string }[]) || []).map((item, i) => (
            <details key={i}>
              <summary>{item.title || "Item"}</summary>
              <p>{item.content}</p>
            </details>
          ))}
        </div>
      );
    case "tabs":
      return (
        <div className="blk-tabs">
          {((d.items as { label: string; content: string }[]) || []).map((item, i) => (
            <div key={i} className="blk-tab-panel">
              <strong>{item.label || "Tab"}</strong>
              <p>{item.content}</p>
            </div>
          ))}
        </div>
      );
    // Layout blocks that contain children
    case "section":
    case "container":
      return (
        <div className={`blk-${block.type}`}>
          {(block.children || []).map((child) => <BlockRenderer key={child.id} block={child} />)}
        </div>
      );
    case "grid":
      return (
        <div className="blk-grid">
          {(block.children || []).map((child) => <BlockRenderer key={child.id} block={child} />)}
        </div>
      );
    case "columns-1":
    case "columns-2":
    case "columns-3":
      const cols = block.type === "columns-1" ? 1 : block.type === "columns-2" ? 2 : 3;
      return (
        <div className="blk-columns" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {(block.children || []).map((child) => <BlockRenderer key={child.id} block={child} />)}
        </div>
      );
    case "header":
      return <header className="blk-header">{(block.children || []).map((child) => <BlockRenderer key={child.id} block={child} />)}</header>;
    case "footer":
      return <footer className="blk-footer">{(block.children || []).map((child) => <BlockRenderer key={child.id} block={child} />)}</footer>;
    default:
      return null;
  }
}

/* ════════════════════════════════════════════════════
   BUILDER MODE
   ════════════════════════════════════════════════════ */

function BuilderMode({ brand: b, setBrand, upload, showToast, companyName }: {
  brand: BrandConfig;
  setBrand: React.Dispatch<React.SetStateAction<BrandConfig>>;
  upload: (file: File) => Promise<string | null>;
  showToast: (msg: string) => void;
  companyName: string;
}) {
  const [pickerOpen, setPickerOpen] = useState<string | null>(null); // section id or null

  function addBlock(sectionId: string, type: BlockType) {
    setBrand((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === sectionId ? { ...s, blocks: [...(s.blocks || []), emptyBlock(type)] } : s
      ),
    }));
    setPickerOpen(null);
  }

  function updateBlock(sectionId: string, blockId: string, data: Record<string, unknown>) {
    setBrand((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === sectionId ? { ...s, blocks: (s.blocks || []).map((bl) => bl.id === blockId ? { ...bl, data: { ...bl.data, ...data } } : bl) } : s
      ),
    }));
  }

  function removeBlock(sectionId: string, blockId: string) {
    setBrand((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === sectionId ? { ...s, blocks: (s.blocks || []).filter((bl) => bl.id !== blockId) } : s
      ),
    }));
  }

  function moveBlock(sectionId: string, blockId: string, dir: -1 | 1) {
    setBrand((p) => ({
      ...p,
      sections: p.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const blocks = [...(s.blocks || [])];
        const idx = blocks.findIndex((bl) => bl.id === blockId);
        const target = idx + dir;
        if (target < 0 || target >= blocks.length) return s;
        [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
        return { ...s, blocks };
      }),
    }));
  }

  return (
    <div className="ba-builder">
      {/* Cover */}
      <div className="ba-b-section">
        <div className="ba-b-title">Cover</div>
        <label>Nome brand</label>
        <input
          value={b.brandName}
          onChange={(e) => setBrand((p) => ({ ...p, brandName: e.target.value }))}
          placeholder={companyName}
        />
        <label>Tagline</label>
        <input
          value={b.tagline}
          onChange={(e) => setBrand((p) => ({ ...p, tagline: e.target.value }))}
          placeholder="Es: Trasformiamo idee in esperienze"
        />
      </div>

      {/* Logo */}
      <div className="ba-b-section">
        <div className="ba-b-title">Logo</div>
        <FileUploadBtn accept="image/*" label="Carica logo" onUpload={async (file) => {
          const url = await upload(file);
          if (url) setBrand((p) => ({ ...p, logos: [...p.logos, { id: crypto.randomUUID(), name: file.name, url, variant: "" }] }));
        }} />
        {b.logos.length > 0 && (
          <div className="ba-b-logo-list">
            {b.logos.map((l) => (
              <div key={l.id} className="ba-b-logo-item">
                <img src={l.url} alt={l.name} />
                <input
                  value={l.variant}
                  onChange={(e) => setBrand((p) => ({
                    ...p, logos: p.logos.map((x) => x.id === l.id ? { ...x, variant: e.target.value } : x),
                  }))}
                  placeholder="Variante (es: Primary, White, Icon)"
                />
                <button className="ba-b-del" onClick={() => setBrand((p) => ({ ...p, logos: p.logos.filter((x) => x.id !== l.id) }))}>{"\u2715"}</button>
              </div>
            ))}
          </div>
        )}
        <label>Linee guida logo</label>
        <textarea
          value={b.logoGuidelines}
          onChange={(e) => setBrand((p) => ({ ...p, logoGuidelines: e.target.value }))}
          placeholder="Regole di utilizzo del logo, clearspace, sfondi consentiti..."
          rows={3}
        />
      </div>

      {/* Colors */}
      <div className="ba-b-section">
        <div className="ba-b-title">Colori</div>
        <BuilderColors colors={b.colors} onChange={(colors) => setBrand((p) => ({ ...p, colors }))} />
      </div>

      {/* Typography */}
      <div className="ba-b-section">
        <div className="ba-b-title">Tipografia</div>
        <BuilderFonts fonts={b.fonts} onChange={(fonts) => setBrand((p) => ({ ...p, fonts }))} upload={upload} />
      </div>

      {/* Media */}
      <div className="ba-b-section">
        <div className="ba-b-title">Media &amp; Immagini</div>
        <FileUploadBtn accept="image/*" label="Carica immagine" onUpload={async (file) => {
          const url = await upload(file);
          if (url) setBrand((p) => ({ ...p, images: [...p.images, { id: crypto.randomUUID(), name: file.name, url }] }));
        }} />
        {b.images.length > 0 && (
          <div className="ba-b-img-grid">
            {b.images.map((img) => (
              <div key={img.id} className="ba-b-img-item">
                <img src={img.url} alt={img.name} />
                <button className="ba-b-del" onClick={() => setBrand((p) => ({ ...p, images: p.images.filter((x) => x.id !== img.id) }))}>{"\u2715"}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sections with Blocks */}
      <div className="ba-b-section">
        <div className="ba-b-title">Sezioni</div>
        <button className="ba-upload-btn" onClick={() => setBrand((p) => ({
          ...p, sections: [...p.sections, { id: crypto.randomUUID(), title: "", content: "", blocks: [] }],
        }))}>+ Aggiungi sezione</button>

        {b.sections.map((s) => (
          <div key={s.id} className="ba-b-custom">
            <div className="ba-b-custom-head">
              <input
                value={s.title}
                onChange={(e) => setBrand((p) => ({
                  ...p, sections: p.sections.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x),
                }))}
                placeholder="Titolo sezione"
              />
              <button className="ba-b-del" onClick={() => setBrand((p) => ({
                ...p, sections: p.sections.filter((x) => x.id !== s.id),
              }))}>{"\u2715"}</button>
            </div>

            {/* Blocks in this section */}
            <div className="blk-list-builder">
              {(s.blocks || []).map((block) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  onUpdate={(data) => updateBlock(s.id, block.id, data)}
                  onRemove={() => removeBlock(s.id, block.id)}
                  onMove={(dir) => moveBlock(s.id, block.id, dir)}
                  upload={upload}
                />
              ))}
            </div>

            {/* Add block */}
            {pickerOpen === s.id ? (
              <BlockPicker onSelect={(type) => addBlock(s.id, type)} onClose={() => setPickerOpen(null)} />
            ) : (
              <button className="blk-add-btn" onClick={() => setPickerOpen(s.id)}>+ Aggiungi blocco</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Block Picker ── */

function BlockPicker({ onSelect, onClose }: { onSelect: (t: BlockType) => void; onClose: () => void }) {
  return (
    <div className="blk-picker">
      <div className="blk-picker-head">
        <span>Scegli blocco</span>
        <button className="ba-b-del" onClick={onClose}>{"\u2715"}</button>
      </div>
      {BLOCK_CATEGORIES.map((cat) => (
        <div key={cat.id} className="blk-picker-cat">
          <div className="blk-picker-cat-label">{cat.label}</div>
          <div className="blk-picker-grid">
            {cat.blocks.map((bl) => (
              <button key={bl.type} className="blk-picker-item" onClick={() => onSelect(bl.type)}>
                <span className="blk-picker-icon">{bl.icon}</span>
                <span className="blk-picker-label">{bl.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Block Editor ── */

function BlockEditor({ block, onUpdate, onRemove, onMove, upload }: {
  block: BrandBlock;
  onUpdate: (data: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  upload: (file: File) => Promise<string | null>;
}) {
  const d = block.data;
  const typeLabel = BLOCK_CATEGORIES.flatMap((c) => c.blocks).find((b) => b.type === block.type)?.label || block.type;

  return (
    <div className="blk-editor">
      <div className="blk-editor-head">
        <span className="blk-editor-type">{typeLabel}</span>
        <div className="blk-editor-actions">
          <button onClick={() => onMove(-1)} title="Sposta su">{"\u2191"}</button>
          <button onClick={() => onMove(1)} title="Sposta giu">{"\u2193"}</button>
          <button onClick={onRemove} title="Elimina">{"\u2715"}</button>
        </div>
      </div>
      <div className="blk-editor-body">
        <BlockEditorFields block={block} onUpdate={onUpdate} upload={upload} />
      </div>
    </div>
  );
}

function BlockEditorFields({ block, onUpdate, upload }: {
  block: BrandBlock;
  onUpdate: (data: Record<string, unknown>) => void;
  upload: (file: File) => Promise<string | null>;
}) {
  const d = block.data;

  switch (block.type) {
    case "heading":
      return (
        <>
          <input value={(d.text as string) || ""} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Testo heading" />
          <select value={(d.level as number) || 2} onChange={(e) => onUpdate({ level: Number(e.target.value) })}>
            <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option>
          </select>
        </>
      );
    case "text":
    case "paragraph":
      return <textarea value={(d.text as string) || ""} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Testo..." rows={3} />;
    case "button":
      return (
        <>
          <input value={(d.text as string) || ""} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Testo bottone" />
          <input value={(d.url as string) || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="URL" />
          <select value={(d.variant as string) || "primary"} onChange={(e) => onUpdate({ variant: e.target.value })}>
            <option value="primary">Primary</option><option value="secondary">Secondary</option>
          </select>
        </>
      );
    case "image":
      return (
        <>
          {d.url && <img src={d.url as string} alt="" style={{ width: "100%", borderRadius: 6, marginBottom: 8 }} />}
          <FileUploadBtn accept="image/*" label={d.url ? "Cambia immagine" : "Carica immagine"} onUpload={async (file) => {
            const url = await upload(file);
            if (url) onUpdate({ url });
          }} />
          <input value={(d.alt as string) || ""} onChange={(e) => onUpdate({ alt: e.target.value })} placeholder="Alt text" />
          <input value={(d.caption as string) || ""} onChange={(e) => onUpdate({ caption: e.target.value })} placeholder="Didascalia" />
        </>
      );
    case "video":
      return (
        <>
          <FileUploadBtn accept="video/*" label={d.url ? "Cambia video" : "Carica video"} onUpload={async (file) => {
            const url = await upload(file);
            if (url) onUpdate({ url });
          }} />
          {!d.url && <input value={(d.url as string) || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="Oppure URL video" />}
          <input value={(d.caption as string) || ""} onChange={(e) => onUpdate({ caption: e.target.value })} placeholder="Didascalia" />
        </>
      );
    case "audio":
      return (
        <>
          <FileUploadBtn accept="audio/*" label={d.url ? "Cambia audio" : "Carica audio"} onUpload={async (file) => {
            const url = await upload(file);
            if (url) onUpdate({ url });
          }} />
          <input value={(d.caption as string) || ""} onChange={(e) => onUpdate({ caption: e.target.value })} placeholder="Didascalia" />
        </>
      );
    case "spacer":
      return <input type="number" value={(d.height as number) || 40} onChange={(e) => onUpdate({ height: Number(e.target.value) })} min={8} max={200} />;
    case "divider":
      return <span style={{ color: "var(--fg3)", fontSize: 12 }}>Linea divisoria</span>;
    case "icon":
      return (
        <>
          <input value={(d.name as string) || ""} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="Carattere/emoji icona" />
          <input type="number" value={(d.size as number) || 24} onChange={(e) => onUpdate({ size: Number(e.target.value) })} min={12} max={120} />
        </>
      );
    case "embed":
      return (
        <>
          <input value={(d.url as string) || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="URL embed (iframe)" />
          <textarea value={(d.html as string) || ""} onChange={(e) => onUpdate({ html: e.target.value })} placeholder="Oppure HTML embed" rows={3} />
        </>
      );
    case "hero":
      return (
        <>
          <input value={(d.title as string) || ""} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Titolo hero" />
          <input value={(d.subtitle as string) || ""} onChange={(e) => onUpdate({ subtitle: e.target.value })} placeholder="Sottotitolo" />
          <input value={(d.bgColor as string) || ""} onChange={(e) => onUpdate({ bgColor: e.target.value })} placeholder="Colore sfondo (es: #1a1a2e)" />
          <FileUploadBtn accept="image/*" label="Immagine sfondo" onUpload={async (file) => {
            const url = await upload(file);
            if (url) onUpdate({ bgUrl: url });
          }} />
        </>
      );
    case "card":
      return (
        <>
          <input value={(d.title as string) || ""} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Titolo card" />
          <textarea value={(d.text as string) || ""} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Testo" rows={2} />
          <FileUploadBtn accept="image/*" label="Immagine card" onUpload={async (file) => {
            const url = await upload(file);
            if (url) onUpdate({ imageUrl: url });
          }} />
        </>
      );
    case "list":
      const items = (d.items as string[]) || [""];
      return (
        <div className="blk-edit-list">
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input value={item} onChange={(e) => {
                const next = [...items]; next[i] = e.target.value;
                onUpdate({ items: next });
              }} placeholder={`Elemento ${i + 1}`} style={{ flex: 1 }} />
              <button className="ba-b-del" onClick={() => onUpdate({ items: items.filter((_, j) => j !== i) })}>{"\u2715"}</button>
            </div>
          ))}
          <button className="blk-add-btn" onClick={() => onUpdate({ items: [...items, ""] })}>+ Elemento</button>
        </div>
      );
    case "accordion":
      const accItems = (d.items as { title: string; content: string }[]) || [{ title: "", content: "" }];
      return (
        <div className="blk-edit-list">
          {accItems.map((item, i) => (
            <div key={i} className="blk-edit-acc-item">
              <div style={{ display: "flex", gap: 6 }}>
                <input value={item.title} onChange={(e) => {
                  const next = [...accItems]; next[i] = { ...next[i], title: e.target.value };
                  onUpdate({ items: next });
                }} placeholder="Titolo" style={{ flex: 1 }} />
                <button className="ba-b-del" onClick={() => onUpdate({ items: accItems.filter((_, j) => j !== i) })}>{"\u2715"}</button>
              </div>
              <textarea value={item.content} onChange={(e) => {
                const next = [...accItems]; next[i] = { ...next[i], content: e.target.value };
                onUpdate({ items: next });
              }} placeholder="Contenuto" rows={2} />
            </div>
          ))}
          <button className="blk-add-btn" onClick={() => onUpdate({ items: [...accItems, { title: "", content: "" }] })}>+ Elemento</button>
        </div>
      );
    case "tabs":
      const tabItems = (d.items as { label: string; content: string }[]) || [{ label: "", content: "" }];
      return (
        <div className="blk-edit-list">
          {tabItems.map((item, i) => (
            <div key={i} className="blk-edit-acc-item">
              <div style={{ display: "flex", gap: 6 }}>
                <input value={item.label} onChange={(e) => {
                  const next = [...tabItems]; next[i] = { ...next[i], label: e.target.value };
                  onUpdate({ items: next });
                }} placeholder="Tab label" style={{ flex: 1 }} />
                <button className="ba-b-del" onClick={() => onUpdate({ items: tabItems.filter((_, j) => j !== i) })}>{"\u2715"}</button>
              </div>
              <textarea value={item.content} onChange={(e) => {
                const next = [...tabItems]; next[i] = { ...next[i], content: e.target.value };
                onUpdate({ items: next });
              }} placeholder="Contenuto tab" rows={2} />
            </div>
          ))}
          <button className="blk-add-btn" onClick={() => onUpdate({ items: [...tabItems, { label: "", content: "" }] })}>+ Tab</button>
        </div>
      );
    default:
      return <span style={{ color: "var(--fg3)", fontSize: 12 }}>Blocco layout</span>;
  }
}

/* ── File Upload Button ── */

function FileUploadBtn({ accept, label, onUpload }: {
  accept: string; label: string;
  onUpload: (file: File) => Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      await onUpload(file);
    }
    setUploading(false);
    if (ref.current) ref.current.value = "";
  }

  return (
    <>
      <input ref={ref} type="file" accept={accept} multiple onChange={handleChange} style={{ display: "none" }} />
      <button className="ba-upload-btn" onClick={() => ref.current?.click()} disabled={uploading}>
        {uploading ? "Caricamento..." : label}
      </button>
    </>
  );
}

/* ── Builder: Colors ── */

function BuilderColors({ colors, onChange }: { colors: BrandColor[]; onChange: (c: BrandColor[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#4f8cff");
  const [usage, setUsage] = useState("");
  const [pct, setPct] = useState("");

  function add() {
    if (!name.trim()) return;
    const pctNum = pct ? Number(pct) : undefined;
    onChange([...colors, { id: crypto.randomUUID(), name: name.trim(), hex, usage: usage.trim(), percentage: pctNum }]);
    setName(""); setHex("#4f8cff"); setUsage(""); setPct(""); setAdding(false);
  }

  function remove(id: string) { onChange(colors.filter((c) => c.id !== id)); }

  function updatePct(id: string, val: string) {
    const num = val === "" ? undefined : Number(val);
    onChange(colors.map((c) => c.id === id ? { ...c, percentage: num } : c));
  }

  return (
    <>
      <button className="ba-upload-btn" onClick={() => setAdding(true)}>+ Aggiungi colore</button>
      {adding && (
        <div className="ba-b-inline-form">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} style={{ width: 40, height: 40, border: "none", padding: 0, cursor: "pointer", borderRadius: 6 }} />
            <input value={hex} onChange={(e) => setHex(e.target.value)} style={{ width: 90, fontFamily: "monospace" }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" style={{ flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="Utilizzo (es: Primary, CTA, Background)" style={{ flex: 1 }} />
            <input value={pct} onChange={(e) => setPct(e.target.value)} placeholder="%" type="number" min={0} max={100} style={{ width: 64 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-cancel" onClick={() => setAdding(false)}>Annulla</button>
            <button className="btn-save" onClick={add}>Aggiungi</button>
          </div>
        </div>
      )}
      {colors.length > 0 && (
        <div className="ba-b-color-list">
          {colors.map((c) => (
            <div key={c.id} className="ba-b-color-item">
              <div className="ba-b-color-dot" style={{ background: c.hex }} />
              <strong>{c.name}</strong>
              <code>{c.hex}</code>
              <input
                className="ba-b-color-pct"
                value={c.percentage ?? ""}
                onChange={(e) => updatePct(c.id, e.target.value)}
                placeholder="%"
                type="number"
                min={0}
                max={100}
              />
              {c.usage && <span>{c.usage}</span>}
              <button className="ba-b-del" onClick={() => remove(c.id)}>{"\u2715"}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Builder: Fonts ── */

function BuilderFonts({ fonts, onChange, upload }: { fonts: BrandFont[]; onChange: (f: BrandFont[]) => void; upload: (file: File) => Promise<string | null> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [usage, setUsage] = useState("");
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function add() {
    if (!name.trim()) return;
    onChange([...fonts, { id: crypto.randomUUID(), name: name.trim(), weight: weight.trim(), usage: usage.trim() }]);
    setName(""); setWeight(""); setUsage(""); setAdding(false);
  }

  async function handleFontUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await upload(file);
    if (url) {
      const fontName = file.name.replace(/\.(woff2?|ttf|otf|eot)$/i, "").replace(/[-_]/g, " ");
      onChange([...fonts, { id: crypto.randomUUID(), name: fontName, weight: "", usage: "", url }]);
    }
    setUploading(false);
    if (fontInputRef.current) fontInputRef.current.value = "";
  }

  function remove(id: string) { onChange(fonts.filter((f) => f.id !== id)); }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="ba-upload-btn" onClick={() => setAdding(true)}>+ Google Font</button>
        <input ref={fontInputRef} type="file" accept=".woff,.woff2,.ttf,.otf,.eot" onChange={handleFontUpload} style={{ display: "none" }} />
        <button className="ba-upload-btn" onClick={() => fontInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Caricamento..." : "\u2191 Carica font"}
        </button>
      </div>
      {adding && (
        <div className="ba-b-inline-form">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome Google Font (es: Inter, Montserrat)" style={{ flex: 1 }} />
            <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso" style={{ width: 120 }} />
          </div>
          <input value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="Utilizzo (es: Heading, Body text)" />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-cancel" onClick={() => setAdding(false)}>Annulla</button>
            <button className="btn-save" onClick={add}>Aggiungi</button>
          </div>
        </div>
      )}
      {fonts.length > 0 && (
        <div className="ba-b-font-list">
          {fonts.map((f) => (
            <div key={f.id} className="ba-b-font-item">
              <span className="ba-b-font-aa" style={{ fontFamily: f.name }}>Aa</span>
              <strong>{f.name}</strong>
              {f.url && <span className="ba-b-font-badge">custom</span>}
              {!f.url && <span className="ba-b-font-badge ba-b-font-badge-g">Google</span>}
              {f.weight && <span>{f.weight}</span>}
              {f.usage && <em>{f.usage}</em>}
              <button className="ba-b-del" onClick={() => remove(f.id)}>{"\u2715"}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
