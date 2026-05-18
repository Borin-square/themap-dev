"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { dataVersion } from "@/lib/square-marketing-data";
import {
  FW_FUNCS, FW_MN, getMockDataForCompany, fwSegColor,
  type FwData, type FwConfig, type FwConfigEntry, type FwGoalData,
} from "@/lib/flywheel";

const MODES = ["STANDARD", "POSITIVO", "LIMITI", "PARTENZA", "INVERSO"] as const;

export default function FlywheelSetupPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const mock = getMockDataForCompany(slug);
  const dv = dataVersion(slug);
  const [data, setData] = useLocalState<FwData>(`themap:${slug}:fwData`, () => mock.data, dv);
  const [config, setConfig] = useLocalState<FwConfig>(`themap:${slug}:fwConfig`, () => mock.config, dv);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  // Inline form state (replaces modals)
  const [goalForm, setGoalForm] = useState<{ fn: string; editName: string | null } | null>(null);
  const [subForm, setSubForm] = useState<string | null>(null); // goalName
  const [confirmDel, setConfirmDel] = useState<{ type: "goal" | "sub"; goal: string; sub?: string } | null>(null);

  // Goal form draft
  const [gfName, setGfName] = useState("");
  const [gfFunc, setGfFunc] = useState("");
  const [gfOwner, setGfOwner] = useState("");
  const [gfMode, setGfMode] = useState("STANDARD");
  const [gfFlags, setGfFlags] = useState("");
  const [gfLimInf, setGfLimInf] = useState("");
  const [gfLimSup, setGfLimSup] = useState("");
  const [gfStart, setGfStart] = useState("");

  // Sub form draft
  const [sfName, setSfName] = useState("");
  const [sfOwner, setSfOwner] = useState("");

  function showToast(msg: string, err?: boolean) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  function toggle(id: string) {
    setOpen((p) => ({ ...p, [id]: !p[id] }));
  }

  const getCfg = (name: string): FwConfigEntry =>
    config[name] || { mode: "STANDARD" };

  // Open goal inline form
  function openGoalForm(fn: string, editName: string | null) {
    setGoalForm({ fn, editName });
    setSubForm(null);
    if (editName) {
      // Populate with existing data
      let existing: FwGoalData | null = null;
      for (const f of FW_FUNCS) {
        if (data[f]?.[editName]) { existing = data[f][editName]; break; }
      }
      const cfg = config[editName] || { mode: "STANDARD" };
      setGfName(editName);
      setGfFunc(fn);
      setGfOwner(existing?.owner || "");
      setGfMode(cfg.mode);
      setGfFlags(existing?.isPercent ? "%" : existing?.isCurrency ? "\u20AC" : "");
      setGfLimInf((cfg as unknown as Record<string, unknown>).limInf?.toString() ?? "");
      setGfLimSup((cfg as unknown as Record<string, unknown>).limSup?.toString() ?? "");
      setGfStart((cfg as unknown as Record<string, unknown>).start?.toString() ?? "");
    } else {
      setGfName("");
      setGfFunc(fn);
      setGfOwner("");
      setGfMode("STANDARD");
      setGfFlags("");
      setGfLimInf("");
      setGfLimSup("");
      setGfStart("");
    }
  }

  function closeGoalForm() { setGoalForm(null); }

  function saveGoalForm() {
    if (!gfName.trim()) return;
    const name = gfName.trim();
    const owner = gfOwner.trim();
    const limInf = gfLimInf ? parseFloat(gfLimInf) : null;
    const limSup = gfLimSup ? parseFloat(gfLimSup) : null;
    const start = gfStart ? parseFloat(gfStart) : null;

    if (goalForm?.editName) {
      // Update
      const oldName = goalForm.editName;
      setData((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as FwData;
        for (const f of FW_FUNCS) {
          if (next[f]?.[oldName]) {
            const g = next[f][oldName];
            g.owner = owner;
            g.isPercent = gfFlags === "%";
            g.isCurrency = gfFlags === "\u20AC";
            if (f !== gfFunc) {
              if (!next[gfFunc]) next[gfFunc] = {};
              next[gfFunc][name] = g;
              delete next[f][oldName];
            } else if (oldName !== name) {
              next[gfFunc][name] = g;
              delete next[gfFunc][oldName];
            }
            break;
          }
        }
        return next;
      });
      setConfig((prev) => {
        const c = { ...prev };
        if (oldName !== name) delete c[oldName];
        c[name] = { mode: gfMode as FwConfigEntry["mode"], limInf, limSup, start };
        return c;
      });
      showToast("Goal aggiornato");
    } else {
      // Create
      setData((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as FwData;
        if (!next[gfFunc]) next[gfFunc] = {};
        next[gfFunc][name] = {
          owner, isPercent: gfFlags === "%", isCurrency: gfFlags === "\u20AC",
          real: Array(12).fill(null), forecast: Array(12).fill(null), subgoals: {},
        };
        return next;
      });
      setConfig((prev) => ({
        ...prev,
        [name]: { mode: gfMode as FwConfigEntry["mode"], limInf, limSup, start },
      }));
      showToast("Goal creato");
    }
    closeGoalForm();
  }

  // Open sub inline form
  function openSubForm(goalName: string) {
    setSubForm(goalName);
    setGoalForm(null);
    setSfName("");
    setSfOwner("");
  }

  function saveSubForm() {
    if (!sfName.trim() || !subForm) return;
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      for (const fn of FW_FUNCS) {
        if (next[fn]?.[subForm]) {
          next[fn][subForm].subgoals[sfName.trim()] = {
            owner: sfOwner.trim(), isPercent: false, isCurrency: false,
            real: Array(12).fill(null), forecast: Array(12).fill(null),
          };
          break;
        }
      }
      return next;
    });
    showToast("Subgoal aggiunto");
    setSubForm(null);
  }

  function deleteGoal(goalName: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      for (const fn of FW_FUNCS) {
        if (next[fn]?.[goalName]) delete next[fn][goalName];
      }
      return next;
    });
    setConfirmDel(null);
    showToast("Goal eliminato");
  }

  function deleteSubgoal(goalName: string, subName: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      for (const fn of FW_FUNCS) {
        if (next[fn]?.[goalName]?.subgoals[subName]) {
          delete next[fn][goalName].subgoals[subName];
        }
      }
      return next;
    });
    setConfirmDel(null);
    showToast("Subgoal eliminato");
  }

  function updateForecast(goalName: string, subName: string, month: number, value: number) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      for (const fn of FW_FUNCS) {
        if (!next[fn]) continue;
        const g = next[fn][goalName];
        if (!g) continue;
        if (subName) {
          if (g.subgoals[subName]) g.subgoals[subName].forecast[month] = value;
        } else {
          g.forecast[month] = value;
        }
      }
      return next;
    });
  }

  function moveGoal(fn: string, goalName: string, dir: -1 | 1) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      const goals = next[fn];
      if (!goals) return prev;
      const keys = Object.keys(goals);
      const idx = keys.indexOf(goalName);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= keys.length) return prev;
      // Swap
      [keys[idx], keys[newIdx]] = [keys[newIdx], keys[idx]];
      // Rebuild object in new order
      const reordered: Record<string, FwGoalData> = {};
      keys.forEach((k) => { reordered[k] = goals[k]; });
      next[fn] = reordered;
      return next;
    });
  }

  function fillAll(goalName: string, subName: string, value: number) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FwData;
      for (const fn of FW_FUNCS) {
        if (!next[fn]) continue;
        const g = next[fn][goalName];
        if (!g) continue;
        const arr = subName ? g.subgoals[subName]?.forecast : g.forecast;
        if (arr) for (let i = 0; i < 12; i++) arr[i] = value;
      }
      return next;
    });
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/flywheel`} className="ee-tab">Overview</Link>
        <span className="ee-tab active">Setup</span>
        <Link href={`/${params.company}/flywheel/real`} className="ee-tab">Consuntivo</Link>
      </div>

      <div className="fws-page">
        {toast && (
          <div className={`fws-toast${toast.err ? " fws-toast-err" : ""}`}>{toast.msg}</div>
        )}

        <div className="fws-head">
          {company && <div className="fws-head-dot" style={{ background: company.color }} />}
          {company?.name || params.company} — Flywheel Setup
        </div>

        {FW_FUNCS.map((fn) => {
          const goals = data[fn] || {};
          const goalKeys = Object.keys(goals);
          const segColor = fwSegColor(fn);

          return (
            <div key={fn} className="fws-section">
              <div className="fws-sec-head">
                <span className="fws-sec-title" style={{ color: segColor }}>{fn}</span>
                <button className="fws-sec-add" onClick={() => openGoalForm(fn, null)}>
                  + Goal
                </button>
              </div>

              {/* Inline goal form — add new (appears under section header) */}
              {goalForm && !goalForm.editName && goalForm.fn === fn && (
                <GoalInlineForm
                  gfName={gfName} setGfName={setGfName}
                  gfFunc={gfFunc} setGfFunc={setGfFunc}
                  gfOwner={gfOwner} setGfOwner={setGfOwner}
                  gfMode={gfMode} setGfMode={setGfMode}
                  gfFlags={gfFlags} setGfFlags={setGfFlags}
                  gfLimInf={gfLimInf} setGfLimInf={setGfLimInf}
                  gfLimSup={gfLimSup} setGfLimSup={setGfLimSup}
                  gfStart={gfStart} setGfStart={setGfStart}
                  onSave={saveGoalForm} onCancel={closeGoalForm}
                  isEdit={false}
                />
              )}

              {goalKeys.length === 0 && !goalForm ? (
                <div className="fws-empty">Nessun goal per {fn}</div>
              ) : (
                goalKeys.map((gn) => {
                  const g = goals[gn];
                  const gid = `${fn}__${gn}`;
                  const isOpen = open[gid] ?? false;
                  const cfg = getCfg(gn);
                  const subKeys = Object.keys(g.subgoals);
                  const isEditingThis = goalForm?.editName === gn;

                  return (
                    <div key={gn} className="fws-goal">
                      {isEditingThis ? (
                        <div style={{ padding: "12px 16px" }}>
                          <GoalInlineForm
                            gfName={gfName} setGfName={setGfName}
                            gfFunc={gfFunc} setGfFunc={setGfFunc}
                            gfOwner={gfOwner} setGfOwner={setGfOwner}
                            gfMode={gfMode} setGfMode={setGfMode}
                            gfFlags={gfFlags} setGfFlags={setGfFlags}
                            gfLimInf={gfLimInf} setGfLimInf={setGfLimInf}
                            gfLimSup={gfLimSup} setGfLimSup={setGfLimSup}
                            gfStart={gfStart} setGfStart={setGfStart}
                            onSave={saveGoalForm} onCancel={closeGoalForm}
                            isEdit={true}
                          />
                        </div>
                      ) : (
                        <div className="fws-goal-head" onClick={() => toggle(gid)}>
                          <span className={`fws-goal-arrow${isOpen ? " open" : ""}`}>&#9654;</span>
                          <span className="fws-goal-name">{gn}</span>
                          {g.owner && <span className="fws-goal-owner">{g.owner}</span>}
                          <span className="fws-badge fws-badge-mode">{cfg.mode}</span>
                          {g.isPercent && <span className="fws-badge fws-badge-flag">%</span>}
                          {g.isCurrency && <span className="fws-badge fws-badge-flag">&euro;</span>}
                          {subKeys.length > 0 && (
                            <span style={{ fontSize: 10, color: "var(--fg3)" }}>{subKeys.length} sub</span>
                          )}
                          <div className="fws-goal-actions" onClick={(e) => e.stopPropagation()}>
                            {goalKeys.indexOf(gn) > 0 && (
                              <button className="fws-move" onClick={() => moveGoal(fn, gn, -1)} title="Sposta su">&#9650;</button>
                            )}
                            {goalKeys.indexOf(gn) < goalKeys.length - 1 && (
                              <button className="fws-move" onClick={() => moveGoal(fn, gn, 1)} title="Sposta giu">&#9660;</button>
                            )}
                            <button onClick={() => openGoalForm(fn, gn)} title="Modifica">&#9998;</button>
                            {confirmDel?.type === "goal" && confirmDel.goal === gn ? (
                              <span className="fws-confirm">
                                <span className="fws-confirm-text">Eliminare?</span>
                                <button className="fws-confirm-yes" onClick={() => deleteGoal(gn)}>Elimina</button>
                                <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>Annulla</button>
                              </span>
                            ) : (
                              <button className="fws-del" onClick={() => setConfirmDel({ type: "goal", goal: gn })} title="Elimina">&times;</button>
                            )}
                          </div>
                        </div>
                      )}

                      {isOpen && !isEditingThis && (
                        <div className="fws-goal-body open">
                          {subKeys.map((sn) => (
                            <div key={sn} className="fws-sub">
                              <span className="fws-sub-conn">&#9492;</span>
                              <span className="fws-sub-name">{sn}</span>
                              {g.subgoals[sn].owner && (
                                <span className="fws-sub-owner">{g.subgoals[sn].owner}</span>
                              )}
                              {confirmDel?.type === "sub" && confirmDel.goal === gn && confirmDel.sub === sn ? (
                                <span className="fws-confirm">
                                  <span className="fws-confirm-text">Eliminare?</span>
                                  <button className="fws-confirm-yes" onClick={() => deleteSubgoal(gn, sn)}>Elimina</button>
                                  <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>Annulla</button>
                                </span>
                              ) : (
                                <button className="fws-sub-del-vis" onClick={() => setConfirmDel({ type: "sub", goal: gn, sub: sn })}>&times;</button>
                              )}
                            </div>
                          ))}

                          {/* Inline sub form */}
                          {subForm === gn ? (
                            <div className="fws-inline-form">
                              <input className="fws-inline-input" placeholder="Nome subgoal..." value={sfName} onChange={(e) => setSfName(e.target.value)} autoFocus />
                              <input className="fws-inline-input" placeholder="Owner (opzionale)" value={sfOwner} onChange={(e) => setSfOwner(e.target.value)} />
                              <button className="pe-act-save" onClick={saveSubForm}>Aggiungi</button>
                              <button className="pe-act-cancel" onClick={() => setSubForm(null)}>Annulla</button>
                            </div>
                          ) : (
                            <button className="fws-add-sub" onClick={() => openSubForm(gn)}>+ Subgoal</button>
                          )}

                          {/* Forecast table — main goal */}
                          <FcTable
                            goalName={gn} subName="" forecast={g.forecast}
                            onChange={(m, v) => updateForecast(gn, "", m, v)}
                            onFillAll={(v) => fillAll(gn, "", v)}
                            onSave={() => showToast("Valori salvati")}
                          />

                          {/* Forecast tables — subgoals */}
                          {subKeys.map((sn) => (
                            <div key={sn}>
                              <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px dashed var(--bd)", fontSize: 10, color: "var(--fg3)", fontWeight: 600 }}>
                                {sn}
                              </div>
                              <FcTable
                                goalName={gn} subName={sn} forecast={g.subgoals[sn].forecast}
                                onChange={(m, v) => updateForecast(gn, sn, m, v)}
                                onFillAll={(v) => fillAll(gn, sn, v)}
                                onSave={() => showToast("Valori salvati")}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── GOAL INLINE FORM ── */

function GoalInlineForm({
  gfName, setGfName, gfFunc, setGfFunc, gfOwner, setGfOwner,
  gfMode, setGfMode, gfFlags, setGfFlags,
  gfLimInf, setGfLimInf, gfLimSup, setGfLimSup,
  gfStart, setGfStart,
  onSave, onCancel, isEdit,
}: {
  gfName: string; setGfName: (v: string) => void;
  gfFunc: string; setGfFunc: (v: string) => void;
  gfOwner: string; setGfOwner: (v: string) => void;
  gfMode: string; setGfMode: (v: string) => void;
  gfFlags: string; setGfFlags: (v: string) => void;
  gfLimInf: string; setGfLimInf: (v: string) => void;
  gfLimSup: string; setGfLimSup: (v: string) => void;
  gfStart: string; setGfStart: (v: string) => void;
  onSave: () => void; onCancel: () => void; isEdit: boolean;
}) {
  return (
    <div className="fws-goal-inline-form">
      <div className="fws-gif-row">
        <input className="fws-inline-input fws-gif-name" placeholder="Nome goal..." value={gfName} onChange={(e) => setGfName(e.target.value)} autoFocus={!isEdit} />
        <select className="fws-inline-select" value={gfFunc} onChange={(e) => setGfFunc(e.target.value)}>
          {FW_FUNCS.map((f) => <option key={f}>{f}</option>)}
        </select>
        <input className="fws-inline-input" placeholder="Owner" value={gfOwner} onChange={(e) => setGfOwner(e.target.value)} />
      </div>
      <div className="fws-gif-row">
        <select className="fws-inline-select" value={gfMode} onChange={(e) => setGfMode(e.target.value)}>
          {MODES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="fws-inline-select" value={gfFlags} onChange={(e) => setGfFlags(e.target.value)}>
          <option value="">Nessun flag</option>
          <option value="%">% Percentuale</option>
          <option value={"\u20AC"}>{"\u20AC"} Valuta</option>
        </select>
        {gfMode === "LIMITI" && (
          <>
            <input className="fws-inline-input fws-inline-num" type="number" step="any" placeholder="Lim. inf" value={gfLimInf} onChange={(e) => setGfLimInf(e.target.value)} />
            <input className="fws-inline-input fws-inline-num" type="number" step="any" placeholder="Lim. sup" value={gfLimSup} onChange={(e) => setGfLimSup(e.target.value)} />
          </>
        )}
        {gfMode === "PARTENZA" && (
          <input className="fws-inline-input fws-inline-num" type="number" step="any" placeholder="Valore partenza" value={gfStart} onChange={(e) => setGfStart(e.target.value)} />
        )}
        <button className="pe-act-save" onClick={onSave}>{isEdit ? "Salva" : "Crea"}</button>
        <button className="pe-act-cancel" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}

/* ── FORECAST TABLE ── */

function FcTable({
  goalName, subName, forecast, onChange, onFillAll, onSave,
}: {
  goalName: string; subName: string;
  forecast: (number | null)[];
  onChange: (month: number, value: number) => void;
  onFillAll: (value: number) => void;
  onSave: () => void;
}) {
  const allEqual = forecast.every((v) => v === forecast[0]) && forecast[0] !== null;
  const [fillMode, setFillMode] = useState(allEqual);
  const firstRef = useRef<HTMLInputElement>(null);

  function handleBlur(i: number, val: string) {
    const v = val === "" ? 0 : parseFloat(val);
    if (isNaN(v)) return;
    if (fillMode && i === 0) {
      onFillAll(v);
    } else {
      onChange(i, v);
    }
  }

  function toggleFill(checked: boolean) {
    setFillMode(checked);
    if (checked && firstRef.current) {
      const v = parseFloat(firstRef.current.value) || 0;
      onFillAll(v);
    }
  }

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
          <tr className="fws-fc">
            <td className="fws-v-label">Forecast</td>
            {Array.from({ length: 12 }, (_, i) => (
              <td key={i}>
                <input
                  ref={i === 0 ? firstRef : undefined}
                  className={`fws-val-inp${fillMode && i > 0 ? " fws-locked" : ""}`}
                  type="number" step="any"
                  defaultValue={forecast[i] ?? ""}
                  onBlur={(e) => handleBlur(i, e.target.value)}
                  readOnly={fillMode && i > 0}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="fws-fill-row">
        <input type="checkbox" className="fws-fill-cb" checked={fillMode} onChange={(e) => toggleFill(e.target.checked)} />
        <label className="fws-fill-lbl">Uguale tutto l&apos;anno</label>
        <button className="fws-save-btn" onClick={onSave}>Salva</button>
      </div>
    </div>
  );
}
