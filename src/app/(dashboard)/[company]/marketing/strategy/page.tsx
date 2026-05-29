"use client";

import { useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { BrandBlock, BlockType } from "@/lib/marketing";
import { BLOCK_CATEGORIES, emptyBlock } from "@/lib/marketing";
import { StrategyPicker, StrategyRenderer, StrategyEditor } from "@/components/StrategyBlock";

type Mode = "view" | "build";

interface StrategyData { blocks: BrandBlock[] }

function emptyStrategy(): StrategyData { return { blocks: [] }; }

function sanitizeStrategy(raw: unknown): StrategyData {
  if (!raw || typeof raw !== "object") return emptyStrategy();
  const r = raw as Record<string, unknown>;
  return { blocks: Array.isArray(r.blocks) ? r.blocks : [] };
}

export default function StrategyPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [rawData, setRawData] = useLocalState<StrategyData>(`themap:${slug}:strategy`, emptyStrategy);
  const data = sanitizeStrategy(rawData);
  const setData = (v: StrategyData | ((prev: StrategyData) => StrategyData)) => {
    if (typeof v === "function") setRawData((p) => sanitizeStrategy(v(sanitizeStrategy(p))));
    else setRawData(sanitizeStrategy(v));
  };

  const [mode, setMode] = useState<Mode>("view");
  const [pickerOpen, setPickerOpen] = useState<"block" | "strategy" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company", slug);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || "Upload fallito"); return null; }
      return d.url;
    } catch { showToast("Errore di connessione"); return null; }
  }, [slug]);

  /* ── Block operations ── */

  function addBlock(type: BlockType) {
    setData((p) => ({ ...p, blocks: [...p.blocks, emptyBlock(type)] }));
    setPickerOpen(null);
  }

  function addStrategyBlock(templateType: string, title: string, content: Record<string, unknown>) {
    const block: BrandBlock = {
      id: crypto.randomUUID(),
      type: "strategy" as BlockType,
      data: { templateType, title, content },
    };
    setData((p) => ({ ...p, blocks: [...p.blocks, block] }));
    setPickerOpen(null);
  }

  function updateBlock(blockId: string, patch: Record<string, unknown>) {
    setData((p) => ({
      ...p,
      blocks: p.blocks.map((bl) => bl.id === blockId ? { ...bl, data: { ...bl.data, ...patch } } : bl),
    }));
  }

  function removeBlock(blockId: string) {
    setData((p) => ({ ...p, blocks: p.blocks.filter((bl) => bl.id !== blockId) }));
  }

  function moveBlock(blockId: string, dir: -1 | 1) {
    setData((p) => {
      const blocks = [...p.blocks];
      const idx = blocks.findIndex((bl) => bl.id === blockId);
      const target = idx + dir;
      if (target < 0 || target >= blocks.length) return p;
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      return { ...p, blocks };
    });
  }

  function duplicateBlock(blockId: string) {
    setData((p) => {
      const idx = p.blocks.findIndex((bl) => bl.id === blockId);
      if (idx === -1) return p;
      const original = p.blocks[idx];
      const copy: BrandBlock = { ...original, id: crypto.randomUUID(), data: JSON.parse(JSON.stringify(original.data)) };
      const blocks = [...p.blocks];
      blocks.splice(idx + 1, 0, copy);
      return { ...p, blocks };
    });
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <span className="ee-tab active">Strategy</span>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="ba-mode-bar">
        <button className={mode === "view" ? "act" : ""} onClick={() => setMode("view")}>Viewer</button>
        <button className={mode === "build" ? "act" : ""} onClick={() => setMode("build")}>Builder</button>
      </div>

      {mode === "view" ? (
        <div className="st-page">
          {data.blocks.length === 0 ? (
            <div className="st-empty">
              <div className="st-empty-icon">{"\u25A8"}</div>
              <p>Nessun contenuto.</p>
              <p>Passa al <strong>Builder</strong> per aggiungere blocchi e template strategici.</p>
            </div>
          ) : (
            <div className="st-blocks">
              {data.blocks.map((block) => (
                <ViewBlock key={block.id} block={block} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="st-page">
          <div className="st-blocks">
            {data.blocks.length === 0 && !pickerOpen && (
              <div className="st-empty">
                <div className="st-empty-icon">{"\u25A8"}</div>
                <p>Nessun contenuto.</p>
                <p>Usa i pulsanti qui sotto per iniziare.</p>
              </div>
            )}

            {data.blocks.map((block) => (
              <div key={block.id} className="st-block-wrap">
                <div className="st-block-toolbar">
                  <button onClick={() => moveBlock(block.id, -1)} title="Sposta su">{"\u2191"}</button>
                  <button onClick={() => moveBlock(block.id, 1)} title="Sposta giu">{"\u2193"}</button>
                  <button onClick={() => duplicateBlock(block.id)} title="Duplica">{"\u29C9"}</button>
                  <button onClick={() => removeBlock(block.id)} title="Elimina">{"\u2715"}</button>
                </div>
                <div className="st-block-edit-card">
                  {block.type === "strategy" ? (
                    <StrategyEditor data={block.data as Record<string, unknown>} onUpdate={(d) => updateBlock(block.id, d)} upload={upload} />
                  ) : (
                    <BasicBlockEditor block={block} onUpdate={(d) => updateBlock(block.id, d)} upload={upload} />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pickers */}
          <div className="blk-btn-row">
            {pickerOpen === "block" ? (
              <BasicBlockPicker onSelect={addBlock} onClose={() => setPickerOpen(null)} />
            ) : (
              <button className="blk-add-btn" onClick={() => setPickerOpen("block")}>+ Aggiungi blocco</button>
            )}
            {pickerOpen === "strategy" ? (
              <StrategyPicker
                onSelect={(templateType, title, content) => addStrategyBlock(templateType, title, content)}
                onClose={() => setPickerOpen(null)}
              />
            ) : (
              <button className="st-add-btn st-add-main" onClick={() => setPickerOpen("strategy")}>+ Add strategy template</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BASIC BLOCK VIEWER (reuses same rendering as Brand Asset)
   ═══════════════════════════════════════════ */

function ViewBlock({ block }: { block: BrandBlock }) {
  if (block.type === "strategy") {
    return <StrategyRenderer data={block.data as Record<string, unknown>} />;
  }
  const d = block.data as Record<string, string | number | string[] | { title: string; content: string }[] | { label: string; content: string }[]>;

  switch (block.type) {
    case "heading": {
      const level = (d.level as number) || 2;
      if (level === 1) return <h1 className="blk-heading">{(d.text as string) || ""}</h1>;
      if (level === 3) return <h3 className="blk-heading">{(d.text as string) || ""}</h3>;
      if (level === 4) return <h4 className="blk-heading">{(d.text as string) || ""}</h4>;
      return <h2 className="blk-heading">{(d.text as string) || ""}</h2>;
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
    case "spacer":
      return <div className="blk-spacer" style={{ height: (d.height as number) || 40 }} />;
    case "divider":
      return <hr className="blk-divider" />;
    case "list":
      return (
        <ul className="blk-list">
          {((d.items as string[]) || []).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    case "card":
      return (
        <div className="blk-card">
          {d.imageUrl && <img src={d.imageUrl as string} alt="" />}
          {d.title && <h3>{d.title as string}</h3>}
          {d.text && <p>{d.text as string}</p>}
        </div>
      );
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════
   BASIC BLOCK EDITOR
   ═══════════════════════════════════════════ */

function BasicBlockEditor({ block, onUpdate, upload }: {
  block: BrandBlock;
  onUpdate: (data: Record<string, unknown>) => void;
  upload: (file: File) => Promise<string | null>;
}) {
  const d = block.data;
  const typeLabel = BLOCK_CATEGORIES.flatMap((c) => c.blocks).find((b) => b.type === block.type)?.label || block.type;

  return (
    <div>
      <div className="blk-editor-head" style={{ margin: "-16px -16px 12px", borderRadius: "12px 12px 0 0" }}>
        <span className="blk-editor-type">{typeLabel}</span>
      </div>
      <div className="blk-editor-body" style={{ padding: 0 }}>
        <BasicBlockFields block={block} onUpdate={onUpdate} upload={upload} />
      </div>
    </div>
  );
}

function BasicBlockFields({ block, onUpdate, upload }: {
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
          <input value={(d.caption as string) || ""} onChange={(e) => onUpdate({ caption: e.target.value })} placeholder="Didascalia" />
        </>
      );
    case "spacer":
      return <input type="number" value={(d.height as number) || 40} onChange={(e) => onUpdate({ height: Number(e.target.value) })} min={8} max={200} />;
    case "divider":
      return <span style={{ color: "var(--fg3)", fontSize: 12 }}>Linea divisoria</span>;
    case "list": {
      const items = (d.items as string[]) || [""];
      return (
        <>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input value={item} onChange={(e) => { const next = [...items]; next[i] = e.target.value; onUpdate({ items: next }); }} placeholder={`Elemento ${i + 1}`} style={{ flex: 1 }} />
              <button className="ba-b-del" onClick={() => onUpdate({ items: items.filter((_, j) => j !== i) })}>{"\u2715"}</button>
            </div>
          ))}
          <button className="blk-add-btn" onClick={() => onUpdate({ items: [...items, ""] })}>+ Elemento</button>
        </>
      );
    }
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
    default:
      return <span style={{ color: "var(--fg3)", fontSize: 12 }}>Blocco non editabile</span>;
  }
}

/* ── Basic Block Picker ── */

function BasicBlockPicker({ onSelect, onClose }: { onSelect: (t: BlockType) => void; onClose: () => void }) {
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
    for (const file of Array.from(files)) await onUpload(file);
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
