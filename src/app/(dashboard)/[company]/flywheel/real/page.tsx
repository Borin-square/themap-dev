"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useAuth } from "@/components/AuthProvider";
import { isAdmin } from "@/lib/auth";
import { useLocalState } from "@/lib/useLocalState";
import { useYear } from "@/components/YearProvider";
import { dataVersion } from "@/lib/square-marketing-data";
import {
  FW_FUNCS, FW_MN, getMockDataForCompany, fwSegColor, fwSortedGoals,
  type FwData, type FwGoalData,
} from "@/lib/flywheel";

export default function FlywheelRealPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const { session } = useAuth();
  const admin = isAdmin(session);
  const visibleFuncs = admin ? FW_FUNCS : FW_FUNCS.filter((fn) => fn !== "DIREZIONE" && fn !== "AMMINISTRAZIONE");
  const mock = getMockDataForCompany(slug);
  const { year } = useYear();
  const dv = dataVersion(slug);
  const emptyInit = () => (year === 2026 ? mock.data : ({} as FwData));
  const [data, setData, flush, hydrated] = useLocalState<FwData>(`themap:${slug}:fwData`, emptyInit, dv, year);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setOpen((p) => ({ ...p, [id]: !p[id] }));
  }

  function showToast(msg: string, err?: boolean) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    if (saving) return;
    // Blur any focused input so its pending onBlur fires and its value flows into state.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
    setSaving(true);
    try {
      // Wait a macrotask so React commits the state update from the blur before we flush.
      await new Promise((r) => setTimeout(r, 0));
      await flush();
      showToast("Valori salvati");
    } catch {
      showToast("Errore salvataggio", true);
    } finally {
      setSaving(false);
    }
  }

  function updateReal(goalName: string, subName: string, month: number, value: number) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      for (const fn of FW_FUNCS) {
        if (!next[fn]) continue;
        const g = next[fn][goalName];
        if (!g) continue;
        if (subName) {
          if (g.subgoals[subName]) g.subgoals[subName].real[month] = value;
        } else {
          g.real[month] = value;
        }
      }
      return next;
    });
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/flywheel`} className="ee-tab">Overview</Link>
        <Link href={`/${params.company}/flywheel/setup`} className="ee-tab">Setup</Link>
        <span className="ee-tab active">Consuntivo</span>
      </div>

      <div className="fws-page">
        {toast && <div className={`fws-toast${toast.err ? " fws-toast-err" : ""}`}>{toast.msg}</div>}

        <div className="fws-head">
          {company && <div className="fws-head-dot" style={{ background: company.color }} />}
          {company?.name || params.company} — Flywheel Consuntivo
        </div>

        {!hydrated && (
          <div className="fws-empty">Caricamento dati…</div>
        )}

        {hydrated && visibleFuncs.map((fn) => {
          const goals = data[fn] || {};
          const goalKeys = fwSortedGoals(goals);
          const segColor = fwSegColor(fn);
          if (goalKeys.length === 0) return null;

          return (
            <div key={fn} className="fws-section">
              <div className="fws-sec-head">
                <span className="fws-sec-title" style={{ color: segColor }}>{fn}</span>
              </div>

              {goalKeys.map((gn) => {
                const g = goals[gn];
                const gid = `R_${fn}__${gn}`;
                const isOpen = open[gid] ?? false;
                const subKeys = Object.keys(g.subgoals);

                return (
                  <div key={gn} className="fws-goal">
                    <div className="fws-goal-head" onClick={() => toggle(gid)}>
                      <span className={`fws-goal-arrow${isOpen ? " open" : ""}`}>&#9654;</span>
                      <span className="fws-goal-name">{gn}</span>
                      {g.owner && <span className="fws-goal-owner">{g.owner}</span>}
                    </div>

                    {isOpen && (
                      <div className="fws-goal-body open">
                        <RealTable
                          real={g.real}
                          onChange={(m, v) => updateReal(gn, "", m, v)}
                          onSave={handleSave}
                          saving={saving}
                        />
                        {subKeys.map((sn) => (
                          <div key={sn}>
                            <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px dashed var(--bd)", fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
                              {sn}
                            </div>
                            <RealTable
                              real={g.subgoals[sn].real}
                              onChange={(m, v) => updateReal(gn, sn, m, v)}
                              onSave={handleSave}
                              saving={saving}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {hydrated && visibleFuncs.every((fn) => Object.keys(data[fn] || {}).length === 0) && (
          <div className="fws-empty">Nessun goal configurato. Vai su Setup per creare i goal.</div>
        )}
      </div>
    </div>
  );
}

function RealTable({
  real, onChange, onSave, saving,
}: {
  real: (number | null)[];
  onChange: (month: number, value: number) => void;
  onSave: () => void;
  saving?: boolean;
}) {
  return (
    <div className="fws-vals">
      <table>
        <thead>
          <tr>
            <th></th>
            {FW_MN.map((m) => <th key={m}>{m}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="fws-real">
            <td className="fws-v-label">Real</td>
            {Array.from({ length: 12 }, (_, i) => (
              <td key={`${i}-${real[i] ?? ""}`}>
                <input
                  className="fws-val-inp"
                  type="number"
                  step="any"
                  defaultValue={real[i] ?? ""}
                  onBlur={(e) => onChange(i, e.target.value === "" ? 0 : parseFloat(e.target.value))}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="fws-fill-row">
        <button
          className="fws-save-btn"
          onClick={(e) => {
            (e.currentTarget as HTMLButtonElement).focus();
            onSave();
          }}
          disabled={saving}
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>
    </div>
  );
}
