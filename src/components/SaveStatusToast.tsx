"use client";

import { useEffect, useState } from "react";
import type { SaveStatusDetail } from "@/lib/useLocalState";

/**
 * Toast globale che ascolta gli errori di salvataggio emessi da useLocalState.
 * Mostra un banner rosso persistente finche' non arriva un save OK sulla stessa
 * chiave (o l'utente lo chiude). Nessun toast verde per i save riusciti: non
 * vogliamo rumore continuo durante l'editing.
 */
export default function SaveStatusToast() {
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<SaveStatusDetail>).detail;
      if (!detail) return;
      if (detail.ok) {
        setError(null);
        setDismissed(false);
        return;
      }
      setError(detail.error || "Errore di salvataggio");
      setDismissed(false);
    }
    window.addEventListener("themap:save-status", handle);
    return () => window.removeEventListener("themap:save-status", handle);
  }, []);

  if (!error || dismissed) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        maxWidth: 380,
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,.14)",
        color: "#ef4444",
        border: "1px solid rgba(239,68,68,.35)",
        boxShadow: "0 8px 24px rgba(0,0,0,.25)",
        fontSize: 13,
        fontWeight: 600,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <div style={{ marginBottom: 4 }}>Salvataggio fallito</div>
        <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.9 }}>
          {error}. I tuoi dati sono nel browser ma NON su Supabase. Non chiudere la tab.
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Chiudi"
        style={{
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 2,
        }}
      >
        {"\u2715"}
      </button>
    </div>
  );
}
