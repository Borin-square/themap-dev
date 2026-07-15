"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function DesignTestPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [code, setCode] = useLocalState<string>(
    `themap:${slug}:designTest`,
    () => STARTER_CODE,
  );

  const [draft, setDraft] = useState<string>(code);
  const [autoRender, setAutoRender] = useState(true);
  const [fs, setFs] = useState(false);

  useEffect(() => { setDraft(code); }, [code]);

  useEffect(() => {
    if (!autoRender) return;
    const t = setTimeout(() => { if (draft !== code) setCode(draft); }, 400);
    return () => clearTimeout(t);
  }, [draft, autoRender, code, setCode]);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fs]);

  const iframeKey = useMemo(() => (autoRender ? code : `manual-${code.length}`), [code, autoRender]);

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
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg2)" }}>
              <input
                type="checkbox"
                checked={autoRender}
                onChange={(e) => setAutoRender(e.target.checked)}
              />
              Auto-render
            </label>
            {!autoRender && (
              <button className="btn-save" onClick={() => setCode(draft)}>Render</button>
            )}
            <button className="btn-cancel" onClick={() => setDraft(STARTER_CODE)}>
              Ripristina esempio
            </button>
            <button className="btn-save" onClick={() => setFs(true)}>
              Fullscreen
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 12,
            marginTop: 12,
            height: "calc(100vh - 220px)",
            minHeight: 480,
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
              background: "#000",
            }}
          >
            <iframe
              key={iframeKey}
              srcDoc={code}
              sandbox="allow-scripts"
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              title="Design preview"
            />
          </div>
        </div>
      </div>

      {fs && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#000",
          }}
        >
          <button
            onClick={() => setFs(false)}
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 10000,
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

          <iframe
            key={`fs-${iframeKey}`}
            srcDoc={code}
            sandbox="allow-scripts"
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            title="Design preview fullscreen"
          />
        </div>
      )}
    </div>
  );
}
