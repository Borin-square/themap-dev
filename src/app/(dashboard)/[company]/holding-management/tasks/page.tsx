"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useYear } from "@/components/YearProvider";
import { Skeleton } from "@/components/Skeleton";
import { peFnColor } from "@/lib/people";

/* ── Types ── */

type Status = "todo" | "doing" | "done" | "blocked";
type Priority = "low" | "med" | "high";

interface GoalRefValue {
  fn?: string;
  goal?: string;
  sub?: string;
  text?: string; // fallback testo libero
}

interface Project {
  id: string;
  holding_slug: string;
  operative_slug: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: Status;
  goal_ref: GoalRefValue | null;
  year: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  holding_slug: string;
  operative_slug: string;
  project_id: string | null;
  title: string;
  description: string | null;
  assignee_name: string | null;
  deadline: string | null;
  status: Status;
  priority: Priority;
  goal_ref: GoalRefValue | null;
  year: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface OperativeMeta { slug: string; name: string; color: string }
interface GoalOption { fn: string; goal: string; sub?: string; owner?: string | null }
interface TaskContext {
  operatives: OperativeMeta[];
  peopleByOperative: Record<string, string[]>;
  goalsByOperative: Record<string, GoalOption[]>;
}

/* ── Const ── */

const STATUSES: Status[] = ["todo", "doing", "done", "blocked"];
const PRIORITIES: Priority[] = ["low", "med", "high"];

const STATUS_LABEL: Record<Status, string> = {
  todo: "Da fare", doing: "In corso", done: "Fatto", blocked: "Bloccato",
};
const STATUS_COLOR: Record<Status, string> = {
  todo: "#6b7280", doing: "#4f8cff", done: "#22c55e", blocked: "#ef4444",
};
const PRIORITY_LABEL: Record<Priority, string> = { low: "Bassa", med: "Media", high: "Alta" };
const PRIORITY_COLOR: Record<Priority, string> = { low: "#6b7280", med: "#f59e0b", high: "#ef4444" };

/* ── Helpers ── */

function fmtGoalRef(g: GoalRefValue | null | undefined): string {
  if (!g) return "";
  if (g.text) return g.text;
  if (g.fn && g.goal) return g.sub ? `${g.fn} · ${g.goal} · ${g.sub}` : `${g.fn} · ${g.goal}`;
  return "";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function isOverdue(iso: string | null, status: Status): boolean {
  if (!iso || status === "done") return false;
  const today = new Date().toISOString().slice(0, 10);
  return iso < today;
}

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

/* ── Page ── */

export default function TasksPage() {
  const params = useParams();
  const holdingSlug = params.company as string;
  const { year } = useYear();

  const [tab, setTab] = useState<"tasks" | "projects">("tasks");
  const [ctx, setCtx] = useState<TaskContext | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterOperative, setFilterOperative] = useState<string>("");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Editing
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [editingProject, setEditingProject] = useState<Partial<Project> | null>(null);

  /* ── Load ── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = await bearer();
      const [ctxRes, projRes, taskRes] = await Promise.all([
        fetch(`/api/holding-management/task-context?year=${year}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/holding-management/projects?holding=${holdingSlug}&year=${year}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/holding-management/tasks?holding=${holdingSlug}&year=${year}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cancelled) return;
      if (!ctxRes.ok || !projRes.ok || !taskRes.ok) {
        setError("Errore caricamento");
        setLoading(false);
        return;
      }
      const ctxJson = await ctxRes.json();
      const projJson = await projRes.json();
      const taskJson = await taskRes.json();
      if (cancelled) return;
      setCtx(ctxJson);
      setProjects(projJson.rows);
      setTasks(taskJson.rows);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [holdingSlug, year]);

  /* ── Realtime ── */

  useEffect(() => {
    const applyRow = <T extends { id: string; holding_slug: string; year: number }>(
      list: T[],
      row: T | null,
      event: "INSERT" | "UPDATE" | "DELETE",
    ): T[] => {
      if (!row) return list;
      if (row.holding_slug !== holdingSlug || row.year !== year) return list;
      if (event === "DELETE") return list.filter((x) => x.id !== row.id);
      const idx = list.findIndex((x) => x.id === row.id);
      if (idx === -1) return [row, ...list];
      const next = list.slice();
      next[idx] = row;
      return next;
    };

    const tasksChannel = supabase
      .channel(`hm_tasks:${holdingSlug}:${year}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_tasks", filter: `holding_slug=eq.${holdingSlug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Task | null;
        setTasks((prev) => applyRow(prev, row, payload.eventType as "INSERT" | "UPDATE" | "DELETE"));
      })
      .subscribe();

    const projectsChannel = supabase
      .channel(`hm_projects:${holdingSlug}:${year}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_projects", filter: `holding_slug=eq.${holdingSlug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Project | null;
        setProjects((prev) => applyRow(prev, row, payload.eventType as "INSERT" | "UPDATE" | "DELETE"));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(projectsChannel);
    };
  }, [holdingSlug, year]);

  /* ── Filtered lists ── */

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterOperative && t.operative_slug !== filterOperative) return false;
      if (filterAssignee && t.assignee_name !== filterAssignee) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, filterOperative, filterAssignee, filterStatus]);

  const projectTaskCounts = useMemo(() => {
    const acc: Record<string, { total: number; done: number }> = {};
    for (const t of tasks) {
      if (!t.project_id) continue;
      acc[t.project_id] ??= { total: 0, done: 0 };
      acc[t.project_id].total++;
      if (t.status === "done") acc[t.project_id].done++;
    }
    return acc;
  }, [tasks]);

  /* ── Mutations ── */

  async function saveTask(patch: Partial<Task>) {
    const token = await bearer();
    const body = {
      ...patch,
      holding_slug: holdingSlug,
      year,
    };
    const res = await fetch("/api/holding-management/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Errore salvataggio");
      return;
    }
    // Il realtime aggiornera' la lista; nel frattempo aggiorno ottimisticamente.
    const j = await res.json();
    setTasks((prev) => {
      const idx = prev.findIndex((x) => x.id === j.row.id);
      if (idx === -1) return [j.row, ...prev];
      const next = prev.slice(); next[idx] = j.row; return next;
    });
    setEditingTask(null);
  }

  async function deleteTask(id: string) {
    const token = await bearer();
    const res = await fetch(`/api/holding-management/tasks?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    setTasks((prev) => prev.filter((x) => x.id !== id));
  }

  async function saveProject(patch: Partial<Project>) {
    const token = await bearer();
    const body = { ...patch, holding_slug: holdingSlug, year };
    const res = await fetch("/api/holding-management/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Errore salvataggio");
      return;
    }
    const j = await res.json();
    setProjects((prev) => {
      const idx = prev.findIndex((x) => x.id === j.row.id);
      if (idx === -1) return [j.row, ...prev];
      const next = prev.slice(); next[idx] = j.row; return next;
    });
    setEditingProject(null);
  }

  async function deleteProject(id: string) {
    if (!confirm("Elimina progetto? Le task associate NON saranno cancellate (project_id → NULL).")) return;
    const token = await bearer();
    const res = await fetch(`/api/holding-management/projects?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((x) => x.id !== id));
    setTasks((prev) => prev.map((t) => t.project_id === id ? { ...t, project_id: null } : t));
  }

  /* ── Render ── */

  if (loading) return <Skeleton height={300} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Task Manager <span style={{ color: "var(--fg3)", fontWeight: 400 }}>· {year}</span>
        </h1>
        <div style={{ display: "flex", gap: 4 }}>
          {(["tasks", "projects"] as const).map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--bd)",
                  background: active ? "var(--fg)" : "transparent",
                  color: active ? "var(--bg)" : "var(--fg2)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {k === "tasks" ? `Task (${tasks.length})` : `Progetti (${projects.length})`}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: "rgba(239,68,68,.12)", color: "#ef4444", borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {tab === "tasks" ? (
        <TasksTab
          tasks={filteredTasks}
          allTasks={tasks}
          projects={projects}
          ctx={ctx}
          filterOperative={filterOperative}
          setFilterOperative={setFilterOperative}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          editing={editingTask}
          setEditing={setEditingTask}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      ) : (
        <ProjectsTab
          projects={projects}
          projectTaskCounts={projectTaskCounts}
          ctx={ctx}
          editing={editingProject}
          setEditing={setEditingProject}
          onSave={saveProject}
          onDelete={deleteProject}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   TASKS TAB
   ═══════════════════════════════════════════ */

function TasksTab(props: {
  tasks: Task[];
  allTasks: Task[];
  projects: Project[];
  ctx: TaskContext | null;
  filterOperative: string;
  setFilterOperative: (s: string) => void;
  filterAssignee: string;
  setFilterAssignee: (s: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  editing: Partial<Task> | null;
  setEditing: (t: Partial<Task> | null) => void;
  onSave: (p: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const { tasks, projects, ctx, filterOperative, setFilterOperative, filterAssignee, setFilterAssignee,
          filterStatus, setFilterStatus, editing, setEditing, onSave, onDelete } = props;

  const allAssignees = useMemo(() => {
    if (!ctx) return [];
    const s = new Set<string>();
    for (const list of Object.values(ctx.peopleByOperative)) list.forEach((n) => s.add(n));
    return Array.from(s).sort();
  }, [ctx]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterOperative} onChange={(e) => setFilterOperative(e.target.value)} style={sel}>
          <option value="">Tutte le operative</option>
          {ctx?.operatives.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
        </select>
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} style={sel}>
          <option value="">Tutti gli assegnatari</option>
          {allAssignees.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={sel}>
          <option value="">Tutti gli status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {!editing && (
          <button onClick={() => setEditing({ status: "todo", priority: "med" })} style={btnPrimary}>
            + Nuova task
          </button>
        )}
      </div>

      {editing && (
        <TaskForm
          value={editing}
          ctx={ctx}
          projects={projects}
          onCancel={() => setEditing(null)}
          onSave={onSave}
        />
      )}

      {tasks.length === 0 && !editing ? (
        <div style={empty}>Nessuna task. Clicca &ldquo;+ Nuova task&rdquo; per iniziare.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              operative={ctx?.operatives.find((o) => o.slug === t.operative_slug)}
              project={t.project_id ? projects.find((p) => p.id === t.project_id) : undefined}
              onEdit={() => setEditing(t)}
              onDelete={() => onDelete(t.id)}
              onStatusChange={(status) => onSave({ ...t, status })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, operative, project, onEdit, onDelete, onStatusChange }: {
  task: Task;
  operative?: OperativeMeta;
  project?: Project;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: Status) => void;
}) {
  const overdue = isOverdue(task.deadline, task.status);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto auto auto auto auto",
      gap: 10,
      alignItems: "center",
      padding: "10px 12px",
      border: "1px solid var(--bd)",
      borderRadius: 8,
      background: "var(--cd)",
    }}>
      <select
        value={task.status}
        onChange={(e) => onStatusChange(e.target.value as Status)}
        style={{
          fontSize: 11,
          padding: "3px 6px",
          borderRadius: 4,
          border: `1px solid ${STATUS_COLOR[task.status]}55`,
          background: `${STATUS_COLOR[task.status]}18`,
          color: STATUS_COLOR[task.status],
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{task.title}</div>
        {(operative || project || task.goal_ref) && (
          <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {operative && <span style={{ color: operative.color }}>● {operative.name}</span>}
            {project && <span>📁 {project.title}</span>}
            {task.goal_ref && <span>🎯 {fmtGoalRef(task.goal_ref)}</span>}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: PRIORITY_COLOR[task.priority], fontWeight: 600 }}>
        {PRIORITY_LABEL[task.priority]}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg2)" }}>
        {task.assignee_name || "—"}
      </div>
      <div style={{ fontSize: 11, color: overdue ? "#ef4444" : "var(--fg2)", fontWeight: overdue ? 700 : 400 }}>
        {task.deadline ? fmtDate(task.deadline) : "—"}
      </div>
      <button onClick={onEdit} style={btnGhost}>Modifica</button>
      <button onClick={onDelete} style={btnGhostDanger}>{"\u2715"}</button>
    </div>
  );
}

function TaskForm({ value, ctx, projects, onCancel, onSave }: {
  value: Partial<Task>;
  ctx: TaskContext | null;
  projects: Project[];
  onCancel: () => void;
  onSave: (p: Partial<Task>) => void;
}) {
  const [form, setForm] = useState<Partial<Task>>(value);
  const [goalMode, setGoalMode] = useState<"dropdown" | "text">(value.goal_ref?.text ? "text" : "dropdown");
  const set = (k: keyof Task, v: unknown) => setForm((p) => ({ ...p, [k]: v as never }));

  const opSlug = form.operative_slug || "";
  const peopleForOp = opSlug && ctx ? (ctx.peopleByOperative[opSlug] || []) : [];
  const goalsForOp = opSlug && ctx ? (ctx.goalsByOperative[opSlug] || []) : [];

  function submit() {
    if (!form.title || !form.operative_slug) return;
    onSave(form);
  }

  return (
    <div style={{
      padding: 14, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--cd)",
      marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
    }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: "var(--fg2)" }}>
        {form.id ? "Modifica task" : "Nuova task"}
      </div>
      <label style={fld}>
        <span style={lbl}>Titolo *</span>
        <input value={form.title || ""} onChange={(e) => set("title", e.target.value)} style={inp} />
      </label>
      <label style={fld}>
        <span style={lbl}>Operativa *</span>
        <select value={form.operative_slug || ""} onChange={(e) => set("operative_slug", e.target.value)} style={inp}>
          <option value="">— seleziona —</option>
          {ctx?.operatives.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
        </select>
      </label>
      <label style={{ ...fld, gridColumn: "1 / -1" }}>
        <span style={lbl}>Descrizione</span>
        <textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} style={inp} />
      </label>
      <label style={fld}>
        <span style={lbl}>Assegnata a</span>
        <select value={form.assignee_name || ""} onChange={(e) => set("assignee_name", e.target.value || null)} style={inp} disabled={!opSlug}>
          <option value="">{opSlug ? "— nessuno —" : "Scegli prima l'operativa"}</option>
          {peopleForOp.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label style={fld}>
        <span style={lbl}>Progetto (opz.)</span>
        <select value={form.project_id || ""} onChange={(e) => set("project_id", e.target.value || null)} style={inp}>
          <option value="">— nessuno —</option>
          {projects.filter((p) => !opSlug || p.operative_slug === opSlug).map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </label>
      <label style={fld}>
        <span style={lbl}>Deadline</span>
        <input type="date" value={form.deadline || ""} onChange={(e) => set("deadline", e.target.value || null)} style={inp} />
      </label>
      <label style={fld}>
        <span style={lbl}>Priorita&#39;</span>
        <select value={form.priority || "med"} onChange={(e) => set("priority", e.target.value as Priority)} style={inp}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
      </label>
      <label style={fld}>
        <span style={lbl}>Status</span>
        <select value={form.status || "todo"} onChange={(e) => set("status", e.target.value as Status)} style={inp}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <span style={lbl}>Goal collegato</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => { setGoalMode("dropdown"); set("goal_ref", null); }}
              style={{ ...tabBtn, ...(goalMode === "dropdown" ? tabBtnAct : {}) }}
            >Dropdown</button>
            <button
              type="button"
              onClick={() => { setGoalMode("text"); set("goal_ref", { text: form.goal_ref?.text || "" }); }}
              style={{ ...tabBtn, ...(goalMode === "text" ? tabBtnAct : {}) }}
            >Libero</button>
            <button
              type="button"
              onClick={() => set("goal_ref", null)}
              style={tabBtn}
            >Nessuno</button>
          </div>
        </div>
        {goalMode === "dropdown" ? (
          <select
            value={goalOptToVal(form.goal_ref)}
            onChange={(e) => set("goal_ref", valToGoalOpt(e.target.value, goalsForOp))}
            style={inp}
            disabled={!opSlug}
          >
            <option value="">{opSlug ? "— nessun goal —" : "Scegli prima l'operativa"}</option>
            {goalsForOp.map((g, i) => (
              <option key={i} value={goalOptToVal({ fn: g.fn, goal: g.goal, sub: g.sub })}>
                {g.fn} · {g.goal}{g.sub ? ` · ${g.sub}` : ""}{g.owner ? ` (${g.owner})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={form.goal_ref?.text || ""}
            onChange={(e) => set("goal_ref", { text: e.target.value })}
            placeholder="Descrivi il goal"
            style={inp}
          />
        )}
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button onClick={onCancel} style={btnGhost}>Annulla</button>
        <button onClick={submit} style={btnPrimary} disabled={!form.title || !form.operative_slug}>Salva</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PROJECTS TAB
   ═══════════════════════════════════════════ */

function ProjectsTab({ projects, projectTaskCounts, ctx, editing, setEditing, onSave, onDelete }: {
  projects: Project[];
  projectTaskCounts: Record<string, { total: number; done: number }>;
  ctx: TaskContext | null;
  editing: Partial<Project> | null;
  setEditing: (p: Partial<Project> | null) => void;
  onSave: (p: Partial<Project>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {!editing && (
          <button onClick={() => setEditing({ status: "todo" })} style={btnPrimary}>+ Nuovo progetto</button>
        )}
      </div>

      {editing && (
        <ProjectForm value={editing} ctx={ctx} onCancel={() => setEditing(null)} onSave={onSave} />
      )}

      {projects.length === 0 && !editing ? (
        <div style={empty}>Nessun progetto. Clicca &ldquo;+ Nuovo progetto&rdquo; per iniziare.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {projects.map((p) => {
            const counts = projectTaskCounts[p.id] || { total: 0, done: 0 };
            const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
            const op = ctx?.operatives.find((o) => o.slug === p.operative_slug);
            return (
              <div key={p.id} style={{
                padding: 14, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--cd)",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                  <div style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 4,
                    border: `1px solid ${STATUS_COLOR[p.status]}55`,
                    background: `${STATUS_COLOR[p.status]}18`,
                    color: STATUS_COLOR[p.status], fontWeight: 600,
                  }}>{STATUS_LABEL[p.status]}</div>
                </div>
                {op && <div style={{ fontSize: 11, color: op.color }}>● {op.name}</div>}
                {p.description && <div style={{ fontSize: 12, color: "var(--fg2)" }}>{p.description}</div>}
                {p.goal_ref && <div style={{ fontSize: 11, color: "var(--fg3)" }}>🎯 {fmtGoalRef(p.goal_ref)}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "var(--fg2)" }}>
                  <span>{counts.done}/{counts.total} task</span>
                  <div style={{ flex: 1, height: 4, background: "var(--bd)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: peFnColor("OPERATION") }} />
                  </div>
                  <span>{pct}%</span>
                </div>
                {p.deadline && <div style={{ fontSize: 11, color: isOverdue(p.deadline, p.status) ? "#ef4444" : "var(--fg3)" }}>
                  Scadenza {fmtDate(p.deadline)}
                </div>}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                  <button onClick={() => setEditing(p)} style={btnGhost}>Modifica</button>
                  <button onClick={() => onDelete(p.id)} style={btnGhostDanger}>Elimina</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectForm({ value, ctx, onCancel, onSave }: {
  value: Partial<Project>;
  ctx: TaskContext | null;
  onCancel: () => void;
  onSave: (p: Partial<Project>) => void;
}) {
  const [form, setForm] = useState<Partial<Project>>(value);
  const [goalMode, setGoalMode] = useState<"dropdown" | "text">(value.goal_ref?.text ? "text" : "dropdown");
  const set = (k: keyof Project, v: unknown) => setForm((p) => ({ ...p, [k]: v as never }));

  const opSlug = form.operative_slug || "";
  const goalsForOp = opSlug && ctx ? (ctx.goalsByOperative[opSlug] || []) : [];

  function submit() {
    if (!form.title || !form.operative_slug) return;
    onSave(form);
  }

  return (
    <div style={{
      padding: 14, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--cd)",
      marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
    }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: "var(--fg2)" }}>
        {form.id ? "Modifica progetto" : "Nuovo progetto"}
      </div>
      <label style={fld}>
        <span style={lbl}>Titolo *</span>
        <input value={form.title || ""} onChange={(e) => set("title", e.target.value)} style={inp} />
      </label>
      <label style={fld}>
        <span style={lbl}>Operativa *</span>
        <select value={form.operative_slug || ""} onChange={(e) => set("operative_slug", e.target.value)} style={inp}>
          <option value="">— seleziona —</option>
          {ctx?.operatives.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
        </select>
      </label>
      <label style={{ ...fld, gridColumn: "1 / -1" }}>
        <span style={lbl}>Descrizione</span>
        <textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} style={inp} />
      </label>
      <label style={fld}>
        <span style={lbl}>Deadline</span>
        <input type="date" value={form.deadline || ""} onChange={(e) => set("deadline", e.target.value || null)} style={inp} />
      </label>
      <label style={fld}>
        <span style={lbl}>Status</span>
        <select value={form.status || "todo"} onChange={(e) => set("status", e.target.value as Status)} style={inp}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <span style={lbl}>Goal collegato</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" onClick={() => { setGoalMode("dropdown"); set("goal_ref", null); }}
              style={{ ...tabBtn, ...(goalMode === "dropdown" ? tabBtnAct : {}) }}>Dropdown</button>
            <button type="button" onClick={() => { setGoalMode("text"); set("goal_ref", { text: form.goal_ref?.text || "" }); }}
              style={{ ...tabBtn, ...(goalMode === "text" ? tabBtnAct : {}) }}>Libero</button>
            <button type="button" onClick={() => set("goal_ref", null)} style={tabBtn}>Nessuno</button>
          </div>
        </div>
        {goalMode === "dropdown" ? (
          <select value={goalOptToVal(form.goal_ref)} onChange={(e) => set("goal_ref", valToGoalOpt(e.target.value, goalsForOp))} style={inp} disabled={!opSlug}>
            <option value="">{opSlug ? "— nessun goal —" : "Scegli prima l'operativa"}</option>
            {goalsForOp.map((g, i) => (
              <option key={i} value={goalOptToVal({ fn: g.fn, goal: g.goal, sub: g.sub })}>
                {g.fn} · {g.goal}{g.sub ? ` · ${g.sub}` : ""}{g.owner ? ` (${g.owner})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input value={form.goal_ref?.text || ""} onChange={(e) => set("goal_ref", { text: e.target.value })} placeholder="Descrivi il goal" style={inp} />
        )}
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button onClick={onCancel} style={btnGhost}>Annulla</button>
        <button onClick={submit} style={btnPrimary} disabled={!form.title || !form.operative_slug}>Salva</button>
      </div>
    </div>
  );
}

/* ── Goal serialization helpers ── */

function goalOptToVal(g: GoalRefValue | null | undefined): string {
  if (!g || !g.fn || !g.goal) return "";
  return g.sub ? `${g.fn}::${g.goal}::${g.sub}` : `${g.fn}::${g.goal}`;
}

function valToGoalOpt(v: string, options: GoalOption[]): GoalRefValue | null {
  if (!v) return null;
  const parts = v.split("::");
  if (parts.length < 2) return null;
  const [fn, goal, sub] = parts;
  const found = options.find((o) => o.fn === fn && o.goal === goal && (o.sub || "") === (sub || ""));
  return { fn, goal, ...(sub ? { sub } : {}), ...(found?.owner ? { owner: found.owner } : {}) };
}

/* ── Styles (inline, coerenti col resto dell'app) ── */

const sel: React.CSSProperties = { fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--cd)", color: "var(--fg)" };
const btnPrimary: React.CSSProperties = { fontSize: 12, padding: "6px 14px", borderRadius: 6, border: 0, background: "var(--fg)", color: "var(--bg)", cursor: "pointer", fontWeight: 700 };
const btnGhost: React.CSSProperties = { fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--bd)", background: "transparent", color: "var(--fg2)", cursor: "pointer" };
const btnGhostDanger: React.CSSProperties = { ...btnGhost, color: "#ef4444", borderColor: "rgba(239,68,68,.3)" };
const empty: React.CSSProperties = { padding: 40, textAlign: "center", color: "var(--fg3)", fontSize: 13, border: "1px dashed var(--bd)", borderRadius: 8 };
const fld: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5 };
const inp: React.CSSProperties = { fontSize: 12, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--fg)", fontFamily: "inherit" };
const tabBtn: React.CSSProperties = { fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "transparent", color: "var(--fg2)", cursor: "pointer" };
const tabBtnAct: React.CSSProperties = { background: "var(--fg2)", color: "var(--bg)", border: 0 };
