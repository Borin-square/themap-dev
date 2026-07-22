"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { ReportLayout, SiteType } from "@/lib/marketing-config";

interface Message {
  role: "user" | "assistant";
  content: string;
  proposedLayout?: ReportLayout | null;
}

export function ReportChat({
  company,
  layout,
  siteType,
  onLayoutChange,
}: {
  company: string;
  layout: ReportLayout;
  siteType: SiteType;
  onLayoutChange: (l: ReportLayout) => void;
}) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Ciao! Posso aiutarti a personalizzare il layout del report per questo cliente. Chiedimi di nascondere sezioni, riordinare, rinominare o aggiungere note.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!input.trim() || busy) return;
    const next: Message[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const res = await fetch(`/api/marketing/report-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          company,
          history: next.map((m) => ({ role: m.role, content: m.content })),
          currentLayout: layout,
          siteType,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, { role: "assistant", content: "Errore: " + (j.error || res.status) }]);
      } else {
        const j = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: j.reply || "(nessuna risposta)", proposedLayout: j.proposedLayout }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Errore: " + (e as Error).message }]);
    }
    setBusy(false);
  }

  function apply(l: ReportLayout) {
    onLayoutChange(l);
    setMessages((prev) => [...prev, { role: "assistant", content: "✓ Modifica applicata. Il report è stato aggiornato." }]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "sticky",
          top: 20,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid var(--bd)",
          background: "var(--bg2)",
          color: "var(--fg)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          writingMode: "vertical-rl",
        }}
        title="Apri chat personalizzazione"
      >
        Personalizza →
      </button>
    );
  }

  return (
    <div style={{
      position: "sticky",
      top: 20,
      width: 340,
      flexShrink: 0,
      background: "var(--bg2)",
      border: "1px solid var(--bd)",
      borderRadius: 12,
      display: "flex",
      flexDirection: "column",
      maxHeight: "calc(100vh - 40px)",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--bd)" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--fg3)" }}>Personalizza layout</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Chat con Claude</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "transparent", border: "none", color: "var(--fg3)", cursor: "pointer", fontSize: 18 }}
          title="Chiudi"
        >
          ×
        </button>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              padding: "8px 10px",
              borderRadius: 8,
              background: m.role === "user" ? "var(--fg)" : "rgba(255,255,255,0.05)",
              color: m.role === "user" ? "var(--bg)" : "var(--fg)",
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}>
              {m.content}
            </div>
            {m.proposedLayout && (
              <button
                onClick={() => apply(m.proposedLayout!)}
                style={{
                  alignSelf: "flex-start",
                  padding: "5px 10px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid #22c55e",
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "#22c55e",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ✓ Applica modifiche
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ alignSelf: "flex-start", padding: "8px 10px", fontSize: 11, color: "var(--fg3)", fontStyle: "italic" }}>
            Sto pensando…
          </div>
        )}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid var(--bd)", display: "flex", gap: 6 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Es. Nascondi Landing page. Sposta Top prodotti in cima."
          disabled={busy}
          rows={2}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 6,
            border: "1px solid var(--bd)",
            background: "transparent",
            color: "var(--fg)",
            fontSize: 12,
            resize: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          style={{
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 6,
            border: "1px solid var(--fg)",
            background: !busy && input.trim() ? "var(--fg)" : "transparent",
            color: !busy && input.trim() ? "var(--bg)" : "var(--fg3)",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          Invia
        </button>
      </div>
    </div>
  );
}
