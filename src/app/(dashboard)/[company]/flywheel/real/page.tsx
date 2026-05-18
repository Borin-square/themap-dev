"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import {
  FW_FUNCS, FW_MN, getMockDataForCompany, fwSegColor,
  type FwData,
} from "@/lib/flywheel";

export default function FlywheelRealPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const mock = getMockDataForCompany(slug);
  const [data, setData] = useLocalState<FwData>(`themap:${slug}:fwData`, () => mock.data);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  function toggle(id: string) {
    setOpen((p) => ({ ...p, [id]: !p[id] }));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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
        {toast && <div className="fws-toast">{toast}</div>}

        <div className="fws-head">
          {company && <div className="fws-head-dot" style={{ background: company.color }} />}
          {company?.name || params.company} — Flywheel Consuntivo
        </div>

        {FW_FUNCS.map((fn) => {
          const goals = data[fn] || {};
          const goalKeys = Object.keys(goals);
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
                          onSave={() => showToast("Valori salvati")}
                        />
                        {subKeys.map((sn) => (
                          <div key={sn}>
                            <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px dashed var(--bd)", fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
                              {sn}
                            </div>
                            <RealTable
                              real={g.subgoals[sn].real}
                              onChange={(m, v) => updateReal(gn, sn, m, v)}
                              onSave={() => showToast("Valori salvati")}
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

        {FW_FUNCS.every((fn) => Object.keys(data[fn] || {}).length === 0) && (
          <div className="fws-empty">Nessun goal configurato. Vai su Setup per creare i goal.</div>
        )}
      </div>
    </div>
  );
}

function RealTable({
  real, onChange, onSave,
}: {
  real: (number | null)[];
  onChange: (month: number, value: number) => void;
  onSave: () => void;
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
              <td key={i}>
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
        <button className="fws-save-btn" onClick={onSave}>Salva</button>
      </div>
    </div>
  );
}
