"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { useYear } from "@/components/YearProvider";
import {
  FW_MN, fwSortedGoals,
  type FwData,
} from "@/lib/flywheel";
import { MFW_FUNCS, mfwSegColor, getMfwMockData } from "@/lib/marketing-flywheel";

export default function MktgFlywheelRealPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const mock = getMfwMockData();
  const { year } = useYear();
  const emptyInit = () => (year === 2026 ? mock.data : ({} as FwData));
  const [data, setData, flush, hydrated] = useLocalState<FwData>(`themap:${slug}:mfwData`, emptyInit, undefined, year);
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
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
    setSaving(true);
    try {
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
      for (const fn of MFW_FUNCS) {
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
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
        <Link href={`/${slug}/marketing/page-generator`} className="ee-tab">Page Generator</Link>
        <Link href={`/${slug}/marketing/design-test`} className="ee-tab">Design Test</Link>
      </div>

      <div className="fws-page">
        {toast && <div className={`fws-toast${toast.err ? " fws-toast-err" : ""}`}>{toast.msg}</div>}

        <div className="fws-head">
          {company && <div className="fws-head-dot" style={{ background: company.color }} />}
          {company?.name || params.company} — Marketing Flywheel Consuntivo
        </div>

        <div className="ee-subnav" style={{ marginBottom: 16 }}>
          <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Overview</Link>
          <Link href={`/${slug}/marketing/flywheel/setup`} className="ee-tab">Setup</Link>
          <span className="ee-tab active">Consuntivo</span>
        </div>

        {!hydrated && (
          <div className="fws-empty">Caricamento dati…</div>
        )}

        {hydrated && MFW_FUNCS.map((fn) => {
          const goals = data[fn] || {};
          const goalKeys = fwSortedGoals(goals);
          const segColor = mfwSegColor(fn);
          if (goalKeys.length === 0) return null;

          return (
            <div key={fn} className="fws-section">
              <div className="fws-sec-head">
                <span className="fws-sec-title" style={{ color: segColor }}>{fn}</span>
              </div>

              {goalKeys.map((gn) => {
                const g = goals[gn];
                const gid = `MR_${fn}__${gn}`;
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

        {hydrated && MFW_FUNCS.every((fn) => Object.keys(data[fn] || {}).length === 0) && (
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
        <button className="fws-save-btn" onClick={onSave} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>
    </div>
  );
}
