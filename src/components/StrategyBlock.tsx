"use client";

import { useState } from "react";
import { STRATEGY_CATEGORIES, ALL_TEMPLATES, getTemplateDef, defaultStrategyContent } from "@/lib/strategy-templates";
import type { STDef } from "@/lib/strategy-templates";

/* ═══════════════════════════════════════════
   STRATEGY TEMPLATE PICKER (Dropdown)
   ═══════════════════════════════════════════ */

export function StrategyPicker({ onSelect, onClose }: {
  onSelect: (templateType: string, title: string, content: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<STDef | null>(null);
  const q = search.toLowerCase().trim();

  const filtered = STRATEGY_CATEGORIES.map((cat) => ({
    ...cat,
    templates: cat.templates.filter((t) =>
      !q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.keywords.some((k) => k.includes(q))
    ),
  })).filter((cat) => cat.templates.length > 0);

  function select(def: STDef) {
    onSelect(def.type, def.label, defaultStrategyContent(def));
    onClose();
  }

  return (
    <div className="st-picker-wrap">
      <div className="st-picker">
        <div className="st-picker-head">
          <span>Add strategy template</span>
          <button className="ba-b-del" onClick={onClose}>{"\u2715"}</button>
        </div>
        <div className="st-picker-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            autoFocus
          />
        </div>

        {/* Blank option */}
        <button className="st-picker-blank" onClick={() => onSelect("blank", "Strategy Block", { sections: [{ key: "main", label: "Notes", color: "", items: [""] }] })}>
          <span className="st-picker-blank-icon">{"\u2B21"}</span>
          <span>Blank strategy block</span>
        </button>

        <div className="st-picker-body">
          {filtered.length === 0 && (
            <div className="st-picker-empty">No templates found for &ldquo;{search}&rdquo;</div>
          )}
          {filtered.map((cat) => (
            <div key={cat.id} className="st-picker-cat">
              <div className="st-picker-cat-label">{cat.label}</div>
              {cat.templates.map((t) => (
                <button
                  key={t.type}
                  className={`st-picker-item ${hovered?.type === t.type ? "st-hovered" : ""}`}
                  onClick={() => select(t)}
                  onMouseEnter={() => setHovered(t)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span className="st-picker-icon">{t.icon}</span>
                  <div className="st-picker-info">
                    <span className="st-picker-name">{t.label}</span>
                    <span className="st-picker-desc">{t.desc}</span>
                  </div>
                  {t.badge && (
                    <span className={`st-badge st-badge-${t.badge}`}>{t.badge === "popular" ? "Popular" : "Advanced"}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Preview panel */}
        {hovered && (
          <div className="st-preview">
            <div className="st-preview-icon">{hovered.icon}</div>
            <div className="st-preview-title">{hovered.label}</div>
            <div className="st-preview-desc">{hovered.desc}</div>
            <div className="st-preview-meta">
              <span>Pattern: {hovered.visual}</span>
              {hovered.badge && <span className={`st-badge st-badge-${hovered.badge}`}>{hovered.badge}</span>}
            </div>
            <div className="st-preview-hint">Click to insert</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STRATEGY TEMPLATE RENDERER (Viewer)
   ═══════════════════════════════════════════ */

export function StrategyRenderer({ data }: { data: Record<string, unknown> }) {
  const templateType = data.templateType as string;
  const title = (data.title as string) || "Strategy";
  const content = (data.content || {}) as Record<string, unknown>;
  const def = getTemplateDef(templateType);
  const visual = def?.visual || "list";
  const hasSections = Array.isArray(content.sections);
  const hasRows = Array.isArray(content.rows);
  const hasCards = Array.isArray(content.cards);

  return (
    <div className="st-block">
      <div className="st-block-head">
        <h3 className="st-block-title">{title}</h3>
        {def && <span className="st-block-type">{def.icon} {def.label}</span>}
      </div>
      <div className={`st-block-body st-visual-${visual}`}>
        {hasSections && <SectionsViewer sections={content.sections as SectionData[]} visual={visual} templateType={templateType} />}
        {hasRows && <TableViewer columns={(content.columns || []) as ColDef[]} rows={content.rows as RowData[]} />}
        {hasCards && <CardsViewer fields={(content.fields || []) as FieldDef[]} cards={content.cards as CardData[]} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STRATEGY TEMPLATE EDITOR (Builder)
   ═══════════════════════════════════════════ */

export function StrategyEditor({ data, onUpdate, upload }: {
  data: Record<string, unknown>;
  onUpdate: (d: Record<string, unknown>) => void;
  upload: (file: File) => Promise<string | null>;
}) {
  const content = (data.content || {}) as Record<string, unknown>;
  const title = (data.title as string) || "";

  function updateContent(patch: Record<string, unknown>) {
    onUpdate({ content: { ...content, ...patch } });
  }

  return (
    <div className="st-editor">
      <input
        className="st-editor-title"
        value={title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Template title"
      />
      {Array.isArray(content.sections) && <SectionsEditor sections={content.sections as SectionData[]} onChange={(s) => updateContent({ sections: s })} />}
      {Array.isArray(content.rows) && <TableEditor columns={(content.columns || []) as ColDef[]} rows={content.rows as RowData[]} onChange={(rows) => updateContent({ rows })} />}
      {Array.isArray(content.cards) && <CardsEditor fields={(content.fields || []) as FieldDef[]} cards={content.cards as CardData[]} onChange={(cards) => updateContent({ cards })} />}
    </div>
  );
}

/* ─── Types ─── */

interface SectionData { key: string; label: string; color?: string; hint?: string; items: string[] }
interface ColDef { key: string; label: string; hint?: string }
type RowData = Record<string, string>;
interface FieldDef { key: string; label: string; type: "text" | "list" | "textarea"; hint?: string }
type CardData = Record<string, string | string[]>;

/* ─── SECTIONS: Viewer ─── */

function SectionsViewer({ sections, visual, templateType }: { sections: SectionData[]; visual: string; templateType: string }) {
  // BMC canvas has a special layout
  if (templateType === "bmc") return <BMCViewer sections={sections} />;

  const gridClass =
    visual === "quad" ? "st-grid-2x2" :
    visual === "sixcol" ? "st-grid-6" :
    visual === "hflow" ? "st-hflow" :
    "st-grid-list";

  return (
    <div className={gridClass}>
      {sections.map((s) => (
        <div key={s.key} className="st-sec" style={s.color ? { "--sec-color": s.color } as React.CSSProperties : undefined}>
          <div className="st-sec-label">{s.label}</div>
          <ul className="st-sec-items">
            {s.items.filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}
            {s.items.filter(Boolean).length === 0 && <li className="st-sec-empty">Add items in Builder</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BMCViewer({ sections }: { sections: SectionData[] }) {
  const get = (key: string) => sections.find((s) => s.key === key);
  const renderSec = (s: SectionData | undefined) => s ? (
    <div className="st-bmc-cell">
      <div className="st-bmc-label">{s.label}</div>
      <ul>{s.items.filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  ) : null;

  return (
    <div className="st-bmc">
      <div className="st-bmc-row st-bmc-top">
        <div className="st-bmc-col">{renderSec(get("partners"))}</div>
        <div className="st-bmc-col st-bmc-split">
          {renderSec(get("activities"))}
          {renderSec(get("resources"))}
        </div>
        <div className="st-bmc-col">{renderSec(get("propositions"))}</div>
        <div className="st-bmc-col st-bmc-split">
          {renderSec(get("relationships"))}
          {renderSec(get("channels"))}
        </div>
        <div className="st-bmc-col">{renderSec(get("segments"))}</div>
      </div>
      <div className="st-bmc-row st-bmc-bottom">
        <div className="st-bmc-col">{renderSec(get("costs"))}</div>
        <div className="st-bmc-col">{renderSec(get("revenue"))}</div>
      </div>
    </div>
  );
}

/* ─── SECTIONS: Editor ─── */

function SectionsEditor({ sections, onChange }: { sections: SectionData[]; onChange: (s: SectionData[]) => void }) {
  function updateItem(sIdx: number, iIdx: number, value: string) {
    const next = sections.map((s, si) => si === sIdx ? { ...s, items: s.items.map((it, ii) => ii === iIdx ? value : it) } : s);
    onChange(next);
  }
  function addItem(sIdx: number) {
    const next = sections.map((s, si) => si === sIdx ? { ...s, items: [...s.items, ""] } : s);
    onChange(next);
  }
  function removeItem(sIdx: number, iIdx: number) {
    const next = sections.map((s, si) => si === sIdx ? { ...s, items: s.items.filter((_, ii) => ii !== iIdx) } : s);
    onChange(next);
  }

  return (
    <div className="st-sec-editor">
      {sections.map((s, sIdx) => (
        <div key={s.key} className="st-sec-ed-group" style={s.color ? { "--sec-color": s.color } as React.CSSProperties : undefined}>
          <div className="st-sec-ed-label">{s.label}</div>
          {s.hint && <div className="st-sec-ed-hint">{s.hint}</div>}
          {s.items.map((item, iIdx) => (
            <div key={iIdx} className="st-sec-ed-row">
              <input value={item} onChange={(e) => updateItem(sIdx, iIdx, e.target.value)} placeholder={s.hint || "Add item..."} />
              <button className="ba-b-del" onClick={() => removeItem(sIdx, iIdx)}>{"\u2715"}</button>
            </div>
          ))}
          <button className="blk-add-btn" onClick={() => addItem(sIdx)}>+ Add item</button>
        </div>
      ))}
    </div>
  );
}

/* ─── TABLE: Viewer ─── */

function TableViewer({ columns, rows }: { columns: ColDef[]; rows: RowData[] }) {
  const filled = rows.filter((r) => Object.values(r).some(Boolean));
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {filled.length === 0 && (
            <tr><td colSpan={columns.length} className="st-table-empty">No data yet. Add rows in Builder.</td></tr>
          )}
          {filled.map((row, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key}>{row[c.key] || ""}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── TABLE: Editor ─── */

function TableEditor({ columns, rows, onChange }: { columns: ColDef[]; rows: RowData[]; onChange: (r: RowData[]) => void }) {
  function updateCell(rIdx: number, key: string, value: string) {
    const next = rows.map((r, i) => i === rIdx ? { ...r, [key]: value } : r);
    onChange(next);
  }
  function addRow() {
    const empty: RowData = {};
    for (const c of columns) empty[c.key] = "";
    onChange([...rows, empty]);
  }
  function removeRow(rIdx: number) {
    onChange(rows.filter((_, i) => i !== rIdx));
  }

  return (
    <div className="st-table-editor">
      {rows.map((row, rIdx) => (
        <div key={rIdx} className="st-table-ed-row">
          <div className="st-table-ed-fields">
            {columns.map((c) => (
              <div key={c.key} className="st-table-ed-field">
                <label>{c.label}</label>
                <input value={row[c.key] || ""} onChange={(e) => updateCell(rIdx, c.key, e.target.value)} placeholder={c.hint || ""} />
              </div>
            ))}
          </div>
          <button className="ba-b-del st-row-del" onClick={() => removeRow(rIdx)}>{"\u2715"}</button>
        </div>
      ))}
      <button className="blk-add-btn" onClick={addRow}>+ Add row</button>
    </div>
  );
}

/* ─── CARDS: Viewer ─── */

function CardsViewer({ fields, cards }: { fields: FieldDef[]; cards: CardData[] }) {
  const filled = cards.filter((c) => fields.some((f) => {
    const v = c[f.key]; return Array.isArray(v) ? v.some(Boolean) : Boolean(v);
  }));

  return (
    <div className="st-cards">
      {filled.length === 0 && <div className="st-table-empty">No cards yet. Add in Builder.</div>}
      {filled.map((card, i) => (
        <div key={i} className="st-card">
          {fields.map((f) => {
            const val = card[f.key];
            if (!val || (Array.isArray(val) && !val.some(Boolean))) return null;
            return (
              <div key={f.key} className="st-card-field">
                <div className="st-card-field-label">{f.label}</div>
                {f.type === "list" && Array.isArray(val) ? (
                  <ul>{(val as string[]).filter(Boolean).map((v, j) => <li key={j}>{v}</li>)}</ul>
                ) : (
                  <div className="st-card-field-value">{val as string}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── CARDS: Editor ─── */

function CardsEditor({ fields, cards, onChange }: { fields: FieldDef[]; cards: CardData[]; onChange: (c: CardData[]) => void }) {
  function updateField(cIdx: number, key: string, value: string | string[]) {
    const next = cards.map((c, i) => i === cIdx ? { ...c, [key]: value } : c);
    onChange(next);
  }
  function addCard() {
    const empty: CardData = {};
    for (const f of fields) empty[f.key] = f.type === "list" ? [""] : "";
    onChange([...cards, empty]);
  }
  function removeCard(cIdx: number) { onChange(cards.filter((_, i) => i !== cIdx)); }

  return (
    <div className="st-cards-editor">
      {cards.map((card, cIdx) => (
        <div key={cIdx} className="st-card-ed">
          <div className="st-card-ed-head">
            <span>Card {cIdx + 1}</span>
            <button className="ba-b-del" onClick={() => removeCard(cIdx)}>{"\u2715"}</button>
          </div>
          {fields.map((f) => (
            <div key={f.key} className="st-card-ed-field">
              <label>{f.label}{f.hint && <span className="st-field-hint" title={f.hint}> ?</span>}</label>
              {f.type === "list" ? (
                <ListFieldEditor
                  items={(card[f.key] as string[]) || [""]}
                  onChange={(items) => updateField(cIdx, f.key, items)}
                  hint={f.hint}
                />
              ) : f.type === "textarea" ? (
                <textarea value={(card[f.key] as string) || ""} onChange={(e) => updateField(cIdx, f.key, e.target.value)} rows={2} placeholder={f.hint || ""} />
              ) : (
                <input value={(card[f.key] as string) || ""} onChange={(e) => updateField(cIdx, f.key, e.target.value)} placeholder={f.hint || ""} />
              )}
            </div>
          ))}
        </div>
      ))}
      <button className="blk-add-btn" onClick={addCard}>+ Add card</button>
    </div>
  );
}

function ListFieldEditor({ items, onChange, hint }: { items: string[]; onChange: (items: string[]) => void; hint?: string }) {
  return (
    <div className="st-list-ed">
      {items.map((item, i) => (
        <div key={i} className="st-list-ed-row">
          <input value={item} onChange={(e) => { const next = [...items]; next[i] = e.target.value; onChange(next); }} placeholder={hint || "..."} />
          <button className="ba-b-del" onClick={() => onChange(items.filter((_, j) => j !== i))}>{"\u2715"}</button>
        </div>
      ))}
      <button className="blk-add-btn" onClick={() => onChange([...items, ""])}>+</button>
    </div>
  );
}
