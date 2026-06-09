"use client";

import { useState } from "react";
import { useLocalState } from "@/lib/useLocalState";
import { useAuth } from "@/components/AuthProvider";
import { isAdmin } from "@/lib/auth";

export default function VisionPage() {
  const { session } = useAuth();
  const admin = isAdmin(session);
  const [slideUrl, setSlideUrl] = useLocalState<string>("themap:holding:vision-url", () => "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  function startEdit() {
    setUrlDraft(slideUrl);
    setEditingUrl(true);
  }

  function saveUrl() {
    setSlideUrl(urlDraft.trim());
    setEditingUrl(false);
  }

  const embedUrl = slideUrl
    ? slideUrl.includes("/embed")
      ? slideUrl
      : slideUrl.replace(/\/edit.*|\/view.*|\/pub.*/, "/embed?start=false&loop=false&delayms=3000")
    : "";

  return (
    <div>
      <div className="ee-head">
        <div className="ee-title">Vision</div>
        {admin && (
          <button className="ee-btn" onClick={startEdit}>
            {slideUrl ? "Cambia presentazione" : "Configura presentazione"}
          </button>
        )}
      </div>

      {!slideUrl ? (
        <div className="cd" style={{ textAlign: "center", padding: 60, color: "var(--fg3)" }}>
          Nessuna presentazione configurata.
          {admin && " Clicca il pulsante in alto per impostare l'URL di Google Slides."}
        </div>
      ) : (
        <div className="vision-wrap">
          <iframe
            id="vSlide"
            src={embedUrl}
            allowFullScreen
            className="vision-iframe"
          />
          <button
            className="ee-btn vision-fs"
            onClick={() => document.getElementById("vSlide")?.requestFullscreen?.()}
          >
            Fullscreen
          </button>
        </div>
      )}

      {editingUrl && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingUrl(false); }}>
          <div className="modal">
            <h3>URL Google Slides</h3>
            <label>Incolla l&apos;URL della presentazione</label>
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://docs.google.com/presentation/d/..."
              autoFocus
            />
            <div className="modal-foot">
              <button className="btn-cancel" onClick={() => setEditingUrl(false)}>Annulla</button>
              <button className="btn-save" onClick={saveUrl}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
