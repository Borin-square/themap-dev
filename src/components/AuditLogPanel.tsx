"use client";

import { useState } from "react";
import type { GEOAuditLog } from "@/lib/geo/types";

interface Props {
  log?: GEOAuditLog;
  toolName: string;
  extra?: Record<string, unknown>;
}

export function AuditLogPanel({ log, toolName, extra }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!log) {
    return (
      <div style={{ marginTop: 16, padding: 12, border: "1px dashed var(--bd)", borderRadius: 8, fontSize: 12, color: "var(--fg3)" }}>
        Log tecnico non disponibile per questa analisi (esegui una nuova scansione per generarlo).
      </div>
    );
  }

  const fullPayload = { tool: toolName, log, ...extra };
  const jsonText = JSON.stringify(fullPayload, null, 2);

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  function downloadLog() {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toolName}-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const durationSec = (log.durationMs / 1000).toFixed(1);

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--bd)", paddingTop: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", background: "var(--bg2)", border: "1px solid var(--bd)",
          borderRadius: 6, color: "var(--fg)", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>&#9654;</span>
        Log completo dell&apos;attivit&agrave; ({durationSec}s)
      </button>

      {open && (
        <div style={{ marginTop: 12, padding: 14, background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={copyLog}
              style={{ padding: "6px 12px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 4, color: "var(--fg)", fontSize: 12, cursor: "pointer" }}
            >
              {copied ? "Copiato \u2713" : "Copia JSON"}
            </button>
            <button
              onClick={downloadLog}
              style={{ padding: "6px 12px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 4, color: "var(--fg)", fontSize: 12, cursor: "pointer" }}
            >
              Scarica JSON
            </button>
          </div>

          {log.steps.length > 0 && (
            <Section title="Passaggi">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
                {log.steps.map((s, i) => (
                  <li key={i}>
                    <span style={{ color: "var(--fg2)" }}>[{new Date(s.timestamp).toLocaleTimeString("it-IT")}]</span>{" "}
                    <span style={{ color: "var(--fg)" }}>{s.label}</span>
                    {s.detail && <div style={{ color: "var(--fg3)", fontSize: 11, marginLeft: 4 }}>{s.detail}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {log.fetches && log.fetches.length > 0 && (
            <Section title="Fetch HTTP">
              {log.fetches.map((f, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 8, background: "var(--bg)", borderRadius: 4, fontSize: 11 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      color: f.ok ? "var(--green, #22c55e)" : f.error ? "var(--red, #ef4444)" : "var(--fg2)",
                      fontWeight: 700,
                    }}>{f.status ?? (f.error ? "ERR" : "?")}</span>
                    <code style={{ wordBreak: "break-all" }}>{f.url}</code>
                  </div>
                  {f.error && <div style={{ color: "var(--red, #ef4444)", marginTop: 4 }}>{f.error}</div>}
                  {f.contentSnippet && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: "pointer", color: "var(--fg2)" }}>Contenuto ({f.contentSnippet.length} char)</summary>
                      <pre style={{ margin: "6px 0 0", padding: 6, background: "var(--bg2)", borderRadius: 3, overflow: "auto", maxHeight: 200, fontSize: 10 }}>
                        {f.contentSnippet}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </Section>
          )}

          {log.llm && (
            <Section title="LLM">
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                <div><b>Modello:</b> <code>{log.llm.model}</code></div>
                {log.llm.stopReason && <div><b>Stop reason:</b> <code>{log.llm.stopReason}</code></div>}
                {(log.llm.inputTokens != null || log.llm.outputTokens != null) && (
                  <div><b>Tokens:</b> in {log.llm.inputTokens ?? "?"} / out {log.llm.outputTokens ?? "?"}</div>
                )}
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Prompt inviato ({log.llm.prompt.length} char)</summary>
                <pre style={{ margin: "6px 0 0", padding: 8, background: "var(--bg)", borderRadius: 4, overflow: "auto", maxHeight: 400, fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {log.llm.prompt}
                </pre>
              </details>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Risposta grezza ({log.llm.rawResponse.length} char)</summary>
                <pre style={{ margin: "6px 0 0", padding: 8, background: "var(--bg)", borderRadius: 4, overflow: "auto", maxHeight: 400, fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {log.llm.rawResponse}
                </pre>
              </details>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--fg2)", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
