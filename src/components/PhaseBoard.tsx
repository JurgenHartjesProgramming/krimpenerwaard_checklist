"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  arrangeActivities,
  createActivity,
  createPhase,
  deleteActivity,
  deletePhase,
  reorderPhases,
  updatePhase,
} from "@/actions/checklist";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { ActivityFormFields } from "@/components/ActivityFormFields";
import { ActivityStatusSelect } from "@/components/ActivityStatusSelect";
import { Comments, type CommentItem } from "@/components/Comments";
import { ChevronRightIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import type { Activity, Phase } from "@/db/schema";
import { COMMENT_LABELS, formatDate, WARNING_LABEL } from "@/lib/labels";

type ActivityRowData = Activity & {
  leadCount: number;
  involvedCount: number;
  /** Comments per label key, from the activity's own comments and its stakeholders' comments. */
  labelCounts: Record<string, number>;
};

interface PhaseView {
  phase: Phase;
  total: number;
  complete: number;
  isComplete: boolean;
  activities: ActivityRowData[];
  unassignedCount: number;
  comments: CommentItem[];
}

interface Props {
  projectId: string;
  phases: PhaseView[];
  canWrite: boolean;
  isAdmin: boolean;
  currentUserId: string;
}

type Drag = { kind: "phase"; id: string } | { kind: "activity"; id: string } | null;
type Layout = Record<string, string[]>;

function layoutOf(phases: PhaseView[]): Layout {
  return Object.fromEntries(phases.map((p) => [p.phase.id, p.activities.map((a) => a.id)]));
}

/** Project overview: phases with their activities. Stakeholders live on the activity pages. */
export function PhaseBoard({ projectId, phases, canWrite, isAdmin, currentUserId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phaseOrder, setPhaseOrder] = useState(phases.map((p) => p.phase.id));
  const [layout, setLayoutState] = useState<Layout>(() => layoutOf(phases));
  const layoutRef = useRef(layout);
  const [drag, setDragState] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);

  const setDrag = (d: Drag) => {
    dragRef.current = d;
    setDragState(d);
  };
  const setLayout = (next: Layout) => {
    layoutRef.current = next;
    setLayoutState(next);
  };

  useEffect(() => {
    setPhaseOrder(phases.map((p) => p.phase.id));
    setLayout(layoutOf(phases));
  }, [phases]);

  // Collapsed phases, remembered per project in this browser (a per-viewer convenience).
  const storageKey = `kc-collapsed-phases-${projectId}`;
  const [collapsed, setCollapsedState] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setCollapsedState(new Set(JSON.parse(saved) as string[]));
    } catch {
      // Storage unavailable: start with everything open.
    }
  }, [storageKey]);
  const setCollapsed = (next: Set<string>) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Ignore: collapsing still works for this page view.
    }
  };
  const togglePhase = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };
  const allPhaseIds = phases.map((p) => p.phase.id);
  const allCollapsed = allPhaseIds.length > 0 && allPhaseIds.every((id) => collapsed.has(id));

  const phaseById = new Map(phases.map((p) => [p.phase.id, p]));
  const activityById = new Map(phases.flatMap((p) => p.activities.map((a) => [a.id, a] as const)));
  const ordered = phaseOrder.map((id) => phaseById.get(id)).filter((p): p is PhaseView => !!p);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) window.alert(result.error);
      router.refresh();
    });
  }

  /** Move the dragged activity to `phaseId`, before `beforeId` (or at the end). */
  function moveActivity(id: string, phaseId: string, beforeId: string | null) {
    const current = layoutRef.current;
    const next: Layout = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v.filter((x) => x !== id)]));
    const list = next[phaseId] ?? [];
    const at = beforeId ? list.indexOf(beforeId) : -1;
    if (at < 0) list.push(id);
    else list.splice(at, 0, id);
    next[phaseId] = list;
    if (JSON.stringify(next) !== JSON.stringify(current)) setLayout(next);
  }

  function finishActivityDrag() {
    if (dragRef.current?.kind !== "activity") return;
    const original = layoutOf(phases);
    const changed = Object.entries(layoutRef.current)
      .filter(([phaseId, ids]) => JSON.stringify(ids) !== JSON.stringify(original[phaseId] ?? []))
      .map(([phaseId, activityIds]) => ({ phaseId, activityIds }));
    setDrag(null);
    if (changed.length > 0) run(() => arrangeActivities({ projectId, phases: changed }));
  }

  function cancelActivityDrag() {
    if (dragRef.current?.kind !== "activity") return;
    setDrag(null);
    setLayout(layoutOf(phases));
  }

  // A row moved to another phase is re-mounted, so its "dragend" never fires;
  // the first mouse movement after a native drag tells us the drag is over.
  useEffect(() => {
    if (drag?.kind !== "activity") return;
    const onMove = () => cancelActivityDrag();
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  let earlierOpen = false;
  return (
    <div className="space-y-5">
      {ordered.length === 0 && (
        <p className="card p-6 text-slate-600">
          Dit project heeft nog geen fases.{canWrite && " Voeg hieronder een fase toe."}
        </p>
      )}
      {ordered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-500">
            Klik op een activiteit om de stakeholders, belangen en documentatie te zien.
            {canWrite && (
              <>
                {" "}
                Sleep aan het <GripIcon className="inline h-4 w-4" />-handvat om fases en activiteiten te ordenen.
              </>
            )}
          </p>
          <button
            type="button"
            className="btn-secondary py-1"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allPhaseIds))}
          >
            {allCollapsed ? "Fases uitklappen" : "Fases inklappen"}
          </button>
        </div>
      )}

      {ordered.map((p, index) => {
        const earlierPhaseIncomplete = earlierOpen;
        if (!p.isComplete) earlierOpen = true;
        const ids = layout[p.phase.id] ?? [];
        const isCollapsed = collapsed.has(p.phase.id);
        return (
          <section
            key={p.phase.id}
            aria-labelledby={`phase-${p.phase.id}`}
            className={`card overflow-hidden ${drag?.kind === "phase" && drag.id === p.phase.id ? "opacity-50" : ""} ${
              drag?.kind === "activity" ? "ring-1 ring-brand-100" : ""
            }`}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              if (drag.kind === "phase" && drag.id !== p.phase.id) {
                const next = [...phaseOrder];
                next.splice(phaseOrder.indexOf(drag.id), 1);
                next.splice(index, 0, drag.id);
                setPhaseOrder(next);
              } else if (drag.kind === "activity" && (ids.length === 0 || isCollapsed)) {
                moveActivity(drag.id, p.phase.id, null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              finishActivityDrag();
            }}
          >
            <PhaseHeader
              view={p}
              index={index}
              canWrite={canWrite}
              collapsed={isCollapsed}
              onToggleCollapse={() => togglePhase(p.phase.id)}
              onDragStart={() => setDrag({ kind: "phase", id: p.phase.id })}
              onDragEnd={() => {
                setDrag(null);
                run(() => reorderPhases(projectId, phaseOrder));
              }}
            />

            {!isCollapsed && (
              <div id={`phase-body-${p.phase.id}`}>
                {ids.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-500">
                    {drag?.kind === "activity" ? "Zet de activiteit hier neer." : "Nog geen activiteiten in deze fase."}
                  </p>
                ) : (
                  <ul>
                    {ids.map((aid) => {
                      const a = activityById.get(aid);
                      if (!a) return null;
                      return (
                        <ActivityRow
                          key={aid}
                          a={a}
                          projectId={projectId}
                          canWrite={canWrite}
                          earlierPhaseIncomplete={earlierPhaseIncomplete}
                          isDragging={drag?.kind === "activity" && drag.id === aid}
                          onDragStart={() => setDrag({ kind: "activity", id: aid })}
                          onDragOverRow={(position) => {
                            const current = dragRef.current;
                            if (current?.kind !== "activity" || current.id === aid) return;
                            const list = (layoutRef.current[p.phase.id] ?? []).filter((x) => x !== current.id);
                            const beforeId = position === "before" ? aid : (list[list.indexOf(aid) + 1] ?? null);
                            moveActivity(current.id, p.phase.id, beforeId);
                          }}
                          onDragEnd={cancelActivityDrag}
                        />
                      );
                    })}
                  </ul>
                )}

                {p.unassignedCount > 0 && (
                  <Link
                    href={`/projects/${projectId}/phases/${p.phase.id}/unassigned`}
                    className="flex items-center justify-between gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-900 hover:bg-amber-100"
                  >
                    <span>
                      <span className="font-semibold">{p.unassignedCount} stakeholder{p.unassignedCount === 1 ? "" : "s"} zonder activiteit</span>{" "}
                      — koppel ze aan een activiteit
                    </span>
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                )}

                <div className="grid gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3 sm:grid-cols-2">
                  {canWrite ? (
                    <details>
                      <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-700">
                        <PlusIcon /> Activiteit toevoegen
                      </summary>
                      <ActionForm action={createActivity} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="phaseId" value={p.phase.id} />
                        <ActivityFormFields />
                        <div className="sm:col-span-2">
                          <button className="btn-primary">Toevoegen</button>
                        </div>
                      </ActionForm>
                    </details>
                  ) : (
                    <div />
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Comments bij deze fase ({p.comments.length})
                    </summary>
                    <div className="mt-3">
                      <Comments
                        comments={p.comments}
                        target={{ phaseId: p.phase.id }}
                        currentUserId={currentUserId}
                        canWrite={canWrite}
                        isAdmin={isAdmin}
                      />
                    </div>
                  </details>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {canWrite && (
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-brand-900">Fase toevoegen</h2>
          <ActionForm action={createPhase} resetOnSuccess className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_auto_auto_auto]">
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" required placeholder="Naam van de fase" aria-label="Naam van de fase" className="input" />
            <input name="description" placeholder="Omschrijving (optioneel)" aria-label="Omschrijving" className="input" />
            <PhaseDateFields idPrefix="new-phase" />
            <button className="btn-primary">Toevoegen</button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  a,
  projectId,
  canWrite,
  earlierPhaseIncomplete,
  isDragging,
  onDragStart,
  onDragOverRow,
  onDragEnd,
}: {
  a: ActivityRowData;
  projectId: string;
  canWrite: boolean;
  earlierPhaseIncomplete: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOverRow: (position: "before" | "after") => void;
  onDragEnd: () => void;
}) {
  const href = `/projects/${projectId}/activities/${a.id}`;
  const stakeholderCount = a.leadCount + a.involvedCount;
  return (
    <li
      draggable={canWrite}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", a.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOverRow(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragEnd={onDragEnd}
      className={`flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 first:border-t-0 hover:bg-brand-50/50 ${
        isDragging ? "bg-brand-50 opacity-60" : ""
      }`}
    >
      {canWrite && (
        <span className="cursor-grab text-slate-400" title="Sleep om te verplaatsen">
          <GripIcon />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link href={href} className="group flex items-baseline gap-2">
          {a.number && <span className="shrink-0 font-semibold text-slate-500 tabular-nums">{a.number}</span>}
          <span className="link font-semibold group-hover:underline">{a.name}</span>
          {COMMENT_LABELS.filter((l) => (a.labelCounts[l.key] ?? 0) > 0).map((l) => {
            const n = a.labelCounts[l.key];
            return (
              <span
                key={l.key}
                title={`${n} comment(s) met het label "${l.label}" bij deze activiteit of haar stakeholders`}
                className={`badge self-center ring-1 ${l.className}`}
              >
                {l.key === WARNING_LABEL && "⚠ "}
                {l.label}
                {n > 1 ? ` (${n})` : ""}
              </span>
            );
          })}
        </Link>
        {a.description && <p className="line-clamp-1 text-sm text-slate-600">{a.description}</p>}
        <p className="text-xs text-slate-500">
          {stakeholderCount === 0
            ? "Nog geen stakeholders"
            : `${a.leadCount} leidend · ${a.involvedCount} ook betrokken`}
          {a.result && <> · Resultaat: {a.result}</>}
        </p>
      </div>
      <ActivityStatusSelect
        activityId={a.id}
        version={a.version}
        status={a.status}
        disabled={!canWrite}
        earlierPhaseIncomplete={earlierPhaseIncomplete}
      />
      <Link href={href} className="btn-ghost p-1.5" title="Open activiteit">
        <ChevronRightIcon />
        <span className="sr-only">Open {a.name}</span>
      </Link>
      {canWrite && (
        <ActionButton
          className="btn-ghost p-1.5 text-slate-500 hover:text-red-700"
          confirm={`Activiteit "${a.name}" en de stakeholders erin verwijderen? Een admin kan dit terugzetten via Geschiedenis.`}
          run={() => deleteActivity(a.id, a.version)}
        >
          <TrashIcon />
          <span className="sr-only">Verwijder {a.name}</span>
        </ActionButton>
      )}
    </li>
  );
}

/** Start and end date inputs of a phase (both optional). */
function PhaseDateFields({ idPrefix, startDate, endDate }: { idPrefix: string; startDate?: string | null; endDate?: string | null }) {
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idPrefix}-start`}>
          Startdatum
        </label>
        <input id={`${idPrefix}-start`} name="startDate" type="date" defaultValue={startDate ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-end`}>
          Einddatum
        </label>
        <input id={`${idPrefix}-end`} name="endDate" type="date" defaultValue={endDate ?? ""} className="input" />
      </div>
    </>
  );
}

function PhaseHeader({
  view,
  index,
  canWrite,
  collapsed,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
}: {
  view: PhaseView;
  index: number;
  canWrite: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { phase } = view;
  const percent = view.total === 0 ? 0 : Math.round((view.complete / view.total) * 100);

  if (editing) {
    return (
      <div className="border-b border-slate-200 p-5">
        <ActionForm
          action={updatePhase}
          onSuccess={() => setEditing(false)}
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_auto_auto_auto_auto]"
        >
          <input type="hidden" name="id" value={phase.id} />
          <input type="hidden" name="version" value={phase.version} />
          <input name="name" required defaultValue={phase.name} aria-label="Naam" className="input" />
          <input name="description" defaultValue={phase.description} aria-label="Omschrijving" className="input" placeholder="Omschrijving" />
          <PhaseDateFields idPrefix={`phase-${phase.id}`} startDate={phase.startDate} endDate={phase.endDate} />
          <button className="btn-primary">Opslaan</button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
            Annuleren
          </button>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${collapsed ? "" : "border-b border-slate-200"}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-controls={`phase-body-${phase.id}`}
          title={collapsed ? "Fase uitklappen" : "Fase inklappen"}
          className="mt-1 rounded-sm p-0.5 text-brand-700 hover:bg-brand-100"
        >
          <ChevronRightIcon className={`h-5 w-5 transition-transform ${collapsed ? "" : "rotate-90"}`} />
          <span className="sr-only">
            {collapsed ? "Uitklappen" : "Inklappen"}: fase {phase.name}
          </span>
        </button>
        {canWrite && (
          <span
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", phase.id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            title="Sleep om de volgorde van fases te wijzigen"
            className="mt-1 cursor-grab text-slate-400 hover:text-slate-700"
          >
            <GripIcon className="h-5 w-5" />
          </span>
        )}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
          {index + 1}
        </span>
        <div>
          <h2 id={`phase-${phase.id}`} className="text-lg font-bold text-brand-900">
            <button type="button" onClick={onToggleCollapse} className="text-left hover:underline">
              {phase.name}
            </button>
            {view.total > 0 && view.isComplete && <span className="badge ml-2 bg-green-100 align-middle text-green-800">Afgerond</span>}
          </h2>
          {(phase.startDate || phase.endDate) && (
            <p className="text-sm text-slate-500">
              {phase.startDate ? formatDate(phase.startDate) : "?"} – {phase.endDate ? formatDate(phase.endDate) : "?"}
            </p>
          )}
          {phase.description && !collapsed && <p className="text-sm text-slate-600">{phase.description}</p>}
          {collapsed && (
            <p className="text-sm text-slate-500">
              {view.total} activiteit{view.total === 1 ? "" : "en"} · ingeklapt
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden w-32 sm:block" aria-hidden>
          <div className="h-1.5 rounded-full bg-slate-200">
            <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <span className="text-sm text-slate-600" title="Afgeronde activiteiten">
          {view.complete}/{view.total}
        </span>
        {canWrite && (
          <>
            <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(true)} title="Fase bewerken">
              <PencilIcon />
              <span className="sr-only">Fase {phase.name} bewerken</span>
            </button>
            <ActionButton
              className="btn-ghost p-1.5 text-slate-500 hover:text-red-700"
              confirm={`Fase "${phase.name}" met alle activiteiten en stakeholders verwijderen? Een admin kan dit terugzetten.`}
              run={() => deletePhase(phase.id, phase.version)}
            >
              <TrashIcon />
              <span className="sr-only">Fase {phase.name} verwijderen</span>
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}
