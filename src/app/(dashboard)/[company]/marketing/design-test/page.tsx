"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";

const STARTER_CODE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; background: #000; color: #fff; overflow: hidden;
    font-family: system-ui, sans-serif; }
  .stage { position: fixed; inset: 0; display: grid; place-items: center; }
  .stage h1 { font-size: clamp(48px, 10vw, 160px); font-weight: 800; letter-spacing: -0.03em; }
  .cursor { position: fixed; top: 0; left: 0; width: 20px; height: 20px;
    border-radius: 50%; background: #fff; mix-blend-mode: difference;
    pointer-events: none; transform: translate(-50%, -50%); z-index: 9999; }
</style>
</head>
<body>
  <div class="stage"><h1>Design Canvas</h1></div>
  <div class="cursor" id="c"></div>
  <script>
    const c = document.getElementById('c');
    let x = 0, y = 0, tx = 0, ty = 0;
    window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
    function loop() {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      c.style.transform = 'translate(' + x + 'px, ' + y + 'px) translate(-50%, -50%)';
      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>`;

interface DesignVersion {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

interface DesignTestState {
  versions: DesignVersion[];
  activeId: string;
}

function newVersion(name: string, code: string): DesignVersion {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name, code, createdAt: now, updatedAt: now };
}

function emptyState(): DesignTestState {
  const v = newVersion("Starter", STARTER_CODE);
  return { versions: [v], activeId: v.id };
}

function sanitize(raw: unknown): DesignTestState {
  if (typeof raw === "string") {
    const v = newVersion("Legacy", raw);
    return { versions: [v], activeId: v.id };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.versions)) {
      const versions: DesignVersion[] = [];
      for (const item of r.versions) {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        if (typeof it.id !== "string" || typeof it.code !== "string") continue;
        versions.push({
          id: it.id,
          name: typeof it.name === "string" && it.name.trim() ? it.name : "Untitled",
          code: it.code,
          createdAt: typeof it.createdAt === "string" ? it.createdAt : new Date().toISOString(),
          updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : new Date().toISOString(),
        });
      }
      if (versions.length > 0) {
        const activeId =
          typeof r.activeId === "string" && versions.some((x) => x.id === r.activeId)
            ? r.activeId
            : versions[0].id;
        return { versions, activeId };
      }
    }
  }
  return emptyState();
}

export default function DesignTestPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [rawState, setRawState] = useLocalState<DesignTestState>(
    `themap:${slug}:designTest`,
    emptyState,
  );
  const state = sanitize(rawState);
  const active =
    state.versions.find((v) => v.id === state.activeId) || state.versions[0];

  const [draft, setDraft] = useState<string>(active.code);
  const [lastLoadedId, setLastLoadedId] = useState<string>(active.id);
  const [autoRender, setAutoRender] = useState(false);
  const [fs, setFs] = useState(false);
  type BarMode = "idle" | "rename" | "new" | "duplicate";
  const [barMode, setBarMode] = useState<BarMode>("idle");
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  // renderId cambia SOLO su render esplicito o cambio versione, non su ogni tasto.
  // Serve a evitare di ricreare l'iframe (e con esso il contesto WebGL) ad ogni digitazione.
  const [renderId, setRenderId] = useState(0);
  const [renderedCode, setRenderedCode] = useState<string>("");
  // showPreview: quando è FALSE l'iframe non esiste proprio nel DOM.
  // Ogni iframe = renderer process separato di Chrome + pipe della sandbox = FD.
  // Tenerlo smontato di default evita che si accumulino FD al solo caricamento pagina.
  const [showPreview, setShowPreview] = useState(false);

  // When the user switches version, reset draft to that version's code and STOP the preview
  useEffect(() => {
    if (active.id !== lastLoadedId) {
      setDraft(active.code);
      setShowPreview(false);
      setRenderedCode("");
      setLastLoadedId(active.id);
      setBarMode("idle");
      setConfirmDel(false);
    }
  }, [active.id, active.code, lastLoadedId]);

  // Debounced auto-save del draft nella versione. NON ricrea l'iframe.
  useEffect(() => {
    const versionId = active.id;
    const snapshot = draft;
    const t = setTimeout(() => {
      setRawState((prev) => {
        const s = sanitize(prev);
        const target = s.versions.find((v) => v.id === versionId);
        if (!target || target.code === snapshot) return s;
        return {
          ...s,
          versions: s.versions.map((v) =>
            v.id === versionId
              ? { ...v, code: snapshot, updatedAt: new Date().toISOString() }
              : v,
          ),
        };
      });
      // Se auto-render è ON, aggiorna anche l'iframe
      if (autoRender && showPreview) {
        setRenderedCode(snapshot);
        setRenderId((n) => n + 1);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [draft, autoRender, showPreview, active.id, setRawState]);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fs]);

  function selectVersion(id: string) {
    setRawState((prev) => ({ ...sanitize(prev), activeId: id }));
  }

  function startCreate(mode: "new" | "duplicate") {
    const suggested =
      mode === "duplicate"
        ? `${active.name} — copia`
        : `Versione ${state.versions.length + 1}`;
    setNameDraft(suggested);
    setBarMode(mode);
  }

  function startRename() {
    setNameDraft(active.name);
    setBarMode("rename");
  }

  function commitBar() {
    const name = nameDraft.trim();
    if (!name) { setBarMode("idle"); return; }
    if (barMode === "rename") {
      setRawState((prev) => {
        const s = sanitize(prev);
        return {
          ...s,
          versions: s.versions.map((v) =>
            v.id === s.activeId
              ? { ...v, name, updatedAt: new Date().toISOString() }
              : v,
          ),
        };
      });
    } else if (barMode === "new" || barMode === "duplicate") {
      const code = barMode === "duplicate" ? draft : STARTER_CODE;
      const v = newVersion(name, code);
      setRawState((prev) => {
        const s = sanitize(prev);
        return { versions: [...s.versions, v], activeId: v.id };
      });
    }
    setBarMode("idle");
  }

  function deleteActive() {
    setRawState((prev) => {
      const s = sanitize(prev);
      if (s.versions.length <= 1) return s;
      const next = s.versions.filter((v) => v.id !== s.activeId);
      return { versions: next, activeId: next[0].id };
    });
    setConfirmDel(false);
  }

  function manualRender() {
    const versionId = active.id;
    const snapshot = draft;
    setRawState((prev) => {
      const s = sanitize(prev);
      return {
        ...s,
        versions: s.versions.map((v) =>
          v.id === versionId
            ? { ...v, code: snapshot, updatedAt: new Date().toISOString() }
            : v,
        ),
      };
    });
    setRenderedCode(snapshot);
    setRenderId((n) => n + 1);
    setShowPreview(true);
  }

  function stopPreview() {
    setShowPreview(false);
    setRenderedCode("");
    setRenderId((n) => n + 1);
  }

  const iframeKey = useMemo(
    () => `${active.id}-${renderId}`,
    [active.id, renderId],
  );

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
        <Link href={`/${slug}/marketing/page-generator`} className="ee-tab">Page Generator</Link>
        <span className="ee-tab active">Design Test</span>
      </div>

      <div className="mktg-page">
        <div className="mktg-head">
          <div className="mktg-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            {company?.name || slug} — Design Test
          </div>
          <button className="btn-save" onClick={() => setFs(true)}>Fullscreen</button>
        </div>

        {/* Version bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            padding: "10px 12px",
            background: "var(--bg2)",
            border: "1px solid var(--bd)",
            borderRadius: 8,
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "var(--fg3)", marginRight: 4 }}>Versione:</span>

          {barMode !== "idle" ? (
            <>
              <span style={{ color: "var(--fg2)" }}>
                {barMode === "rename" ? "Nuovo nome:" : barMode === "duplicate" ? "Nome copia:" : "Nome versione:"}
              </span>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBar();
                  if (e.key === "Escape") setBarMode("idle");
                }}
                autoFocus
                style={inputStyle}
              />
              <button className="btn-save" onClick={commitBar}>
                {barMode === "rename" ? "Salva nome" : "Crea"}
              </button>
              <button className="btn-cancel" onClick={() => setBarMode("idle")}>Annulla</button>
            </>
          ) : (
            <>
              <select
                value={state.activeId}
                onChange={(e) => selectVersion(e.target.value)}
                style={inputStyle}
              >
                {state.versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button style={btnStyle} onClick={startRename}>Rinomina</button>
              <button style={btnStyle} onClick={() => startCreate("duplicate")}>+ Duplica</button>
              <button style={btnStyle} onClick={() => startCreate("new")}>+ Nuova</button>
              {state.versions.length > 1 && (
                confirmDel ? (
                  <span className="fws-confirm">
                    <button className="fws-confirm-yes" onClick={deleteActive}>Sì</button>
                    <button className="fws-confirm-no" onClick={() => setConfirmDel(false)}>No</button>
                  </span>
                ) : (
                  <button
                    style={{ ...btnStyle, color: "#ff5566", borderColor: "rgba(255,85,102,0.4)" }}
                    onClick={() => setConfirmDel(true)}
                  >
                    Elimina
                  </button>
                )
              )}
            </>
          )}

          <span style={{ flex: 1 }} />

          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg2)" }}>
            <input
              type="checkbox"
              checked={autoRender}
              onChange={(e) => setAutoRender(e.target.checked)}
            />
            Auto-render
          </label>
          {showPreview && (
            <button style={btnStyle} onClick={stopPreview}>Stop preview</button>
          )}
          <button className="btn-save" onClick={manualRender}>
            {showPreview ? "Re-render" : "Render"}
          </button>
        </div>

        {/* Editor + preview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 12,
            marginTop: 12,
            height: "calc(100vh - 280px)",
            minHeight: 460,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              height: "100%",
              padding: 12,
              border: "1px solid var(--bd)",
              borderRadius: 8,
              background: "var(--bg2)",
              color: "var(--fg)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              lineHeight: 1.5,
              resize: "none",
              outline: "none",
            }}
            placeholder="Incolla qui HTML/CSS/JS completo (con <style> e <script>)…"
          />
          <div
            style={{
              border: "1px solid var(--bd)",
              borderRadius: 8,
              overflow: "hidden",
              background: "#0a0a0a",
              display: "grid",
              placeItems: "center",
            }}
          >
            {showPreview ? (
              <iframe
                key={iframeKey}
                srcDoc={renderedCode}
                sandbox="allow-scripts"
                style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                title="Design preview"
              />
            ) : (
              <div style={{ color: "#666", fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", textAlign: "center", padding: 24 }}>
                Clicca Render per avviare il preview
              </div>
            )}
          </div>
        </div>
      </div>

      {fs && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000" }}>
          <div
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 10000,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 11,
                border: "1px solid rgba(255,255,255,0.2)",
                backdropFilter: "blur(6px)",
              }}
            >
              {active.name}
            </span>
            <button
              onClick={() => setFs(false)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 11,
                cursor: "pointer",
                backdropFilter: "blur(6px)",
              }}
            >
              Chiudi (Esc)
            </button>
          </div>
          {showPreview ? (
            <iframe
              key={`fs-${iframeKey}`}
              srcDoc={renderedCode}
              sandbox="allow-scripts"
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              title="Design preview fullscreen"
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "#666",
                fontSize: 12,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
              }}
            >
              Clicca Render per avviare il preview
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: "5px 8px",
  border: "1px solid var(--bd)",
  borderRadius: 4,
  background: "var(--bg)",
  color: "var(--fg)",
  fontSize: 12,
  minWidth: 200,
};

const btnStyle: CSSProperties = {
  padding: "5px 10px",
  border: "1px solid var(--bd)",
  borderRadius: 4,
  background: "var(--bg)",
  color: "var(--fg)",
  fontSize: 11,
  cursor: "pointer",
};
