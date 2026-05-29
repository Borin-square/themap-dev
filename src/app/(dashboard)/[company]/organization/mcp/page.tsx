"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function McpPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const color = company?.color || "var(--accent)";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.content || "Nessuna risposta." }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore di connessione";
      setMessages((prev) => [...prev, { role: "assistant", content: `Errore: ${msg}. Riprova.` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearChat() {
    setMessages([]);
    inputRef.current?.focus();
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/people`} className="ee-tab">People</Link>
        <Link href={`/${params.company}/people/organization`} className="ee-tab">Organigramma</Link>
        <Link href={`/${params.company}/people/rituals`} className="ee-tab">Rituals</Link>
        <Link href={`/${params.company}/organization/tools`} className="ee-tab">Tools</Link>
        <span className="ee-tab active">MCP</span>
      </div>

      <div className="mcp-page">
        <div className="mcp-head">
          <span style={{ color }}>{"\u25A0"}</span>
          MCP Chat — {company?.name || params.company}
          <span className="mcp-badge">HubSpot</span>
          {messages.length > 0 && (
            <button className="mcp-clear" onClick={clearChat}>Pulisci chat</button>
          )}
        </div>

        <div className="mcp-chat" ref={scrollRef}>
          {messages.length === 0 && !loading && (
            <div className="mcp-empty">
              <div className="mcp-empty-icon">&#9883;</div>
              <div className="mcp-empty-title">Chiedi qualcosa su HubSpot</div>
              <div className="mcp-empty-sub">
                Puoi cercare contatti, aziende, deal, pipeline e owner.
              </div>
              <div className="mcp-suggestions">
                {[
                  "Mostrami gli ultimi deal",
                  "Cerca contatti con email @gmail.com",
                  "Quante aziende abbiamo in HubSpot?",
                  "Chi sono gli owner del team?",
                ].map((s) => (
                  <button key={s} className="mcp-suggestion" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`mcp-msg mcp-msg-${m.role}`}>
              <div className="mcp-msg-avatar">
                {m.role === "user" ? "\u{1F464}" : "\u{1F916}"}
              </div>
              <div className="mcp-msg-body">
                <div className="mcp-msg-role">{m.role === "user" ? "Tu" : "Assistente"}</div>
                <div className="mcp-msg-text">{m.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="mcp-msg mcp-msg-assistant">
              <div className="mcp-msg-avatar">{"\u{1F916}"}</div>
              <div className="mcp-msg-body">
                <div className="mcp-msg-role">Assistente</div>
                <div className="mcp-typing">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mcp-input-area">
          <textarea
            ref={inputRef}
            className="mcp-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Scrivi un messaggio..."
            rows={1}
            disabled={loading}
          />
          <button
            className="mcp-send"
            onClick={send}
            disabled={!input.trim() || loading}
            style={{ background: input.trim() && !loading ? color : undefined }}
          >
            &#10148;
          </button>
        </div>
      </div>
    </div>
  );
}
