"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { arrangeStakeholders, deleteStakeholder } from "@/actions/checklist";
import { ActionButton } from "@/components/ActionForm";
import { ContactDialog } from "@/components/ContactDialog";
import { ChevronRightIcon, FileIcon, GripIcon, LinkIcon, PaperclipIcon, TrashIcon } from "@/components/icons";
import { StatusSelect } from "@/components/StatusSelect";
import type { Stakeholder, StakeholderRole } from "@/db/schema";
import { formatBytes } from "@/lib/files";
import { COMMENT_LABELS, formatDate, isComplete, ROLE_IN_ACTIVITY_LABELS, WARNING_LABEL } from "@/lib/labels";

export type StakeholderRow = Stakeholder & {
  docCount: number;
  /** Number of comments per label key, e.g. { pas_op: 2, vraag: 1 }. */
  labelCounts: Record<string, number>;
  links: { id: string; title: string; url: string; description: string }[];
  files: { id: string; filename: string; size: number }[];
};

type Groups = Record<StakeholderRole, string[]>;

function groupsOf(rows: StakeholderRow[]): Groups {
  return {
    lead: rows.filter((s) => s.role === "lead").map((s) => s.id),
    involved: rows.filter((s) => s.role === "involved").map((s) => s.id),
  };
}

/**
 * Stakeholders of one activity in two groups, "Leidend" and "Ook betrokken".
 * Rows can be expanded (background + documentation) and dragged to reorder or to switch group.
 */
export function ActivityStakeholders({
  activityId,
  projectId,
  stakeholders,
  canWrite,
  earlierPhaseIncomplete,
}: {
  activityId: string;
  projectId: string;
  stakeholders: StakeholderRow[];
  canWrite: boolean;
  earlierPhaseIncomplete: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [groups, setGroupsState] = useState<Groups>(() => groupsOf(stakeholders));
  const groupsRef = useRef(groups);
  const [dragId, setDragIdState] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const setGroups = (g: Groups) => {
    groupsRef.current = g;
    setGroupsState(g);
  };
  const setDragId = (id: string | null) => {
    dragRef.current = id;
    setDragIdState(id);
  };

  useEffect(() => setGroups(groupsOf(stakeholders)), [stakeholders]);

  const byId = new Map(stakeholders.map((s) => [s.id, s]));
  const allIds = stakeholders.map((s) => s.id);
  const allExpanded = allIds.length > 0 && allIds.every((id) => expanded.has(id));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function move(id: string, group: StakeholderRole, beforeId: string | null) {
    const cur = groupsRef.current;
    const next: Groups = { lead: cur.lead.filter((x) => x !== id), involved: cur.involved.filter((x) => x !== id) };
    const at = beforeId ? next[group].indexOf(beforeId) : -1;
    if (at < 0) next[group].push(id);
    else next[group].splice(at, 0, id);
    if (JSON.stringify(next) !== JSON.stringify(cur)) setGroups(next);
  }

  function finish() {
    if (!dragRef.current) return;
    setDragId(null);
    const original = groupsOf(stakeholders);
    if (JSON.stringify(original) === JSON.stringify(groupsRef.current)) return;
    const { lead, involved } = groupsRef.current;
    startTransition(async () => {
      const r = await arrangeStakeholders({ activityId, lead, involved });
      if (!r.ok) window.alert(r.error);
      router.refresh();
    });
  }

  function cancel() {
    if (!dragRef.current) return;
    setDragId(null);
    setGroups(groupsOf(stakeholders));
  }

  // A row moved to the other group is re-mounted, so its "dragend" never fires;
  // the first mouse movement after a native drag tells us the drag is over.
  useEffect(() => {
    if (!dragId) return;
    const onMove = () => cancel();
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  return (
    <div className="space-y-4">
      {allIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Klap een stakeholder uit (<ChevronRightIcon className="inline h-3.5 w-3.5" />) voor belangen, eisen en documentatie.
            {canWrite && " Sleep een stakeholder om de volgorde of de rol (leidend / ook betrokken) te wijzigen."}
          </p>
          <button
            type="button"
            className="btn-secondary py-1"
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(allIds))}
          >
            {allExpanded ? "Alles inklappen" : "Alles uitklappen"}
          </button>
        </div>
      )}
      {(["lead", "involved"] as const).map((group) => {
        const ids = groups[group];
        return (
          <section
            key={group}
            aria-labelledby={`group-${group}`}
            className={`card overflow-hidden ${dragId ? "ring-1 ring-brand-100" : ""}`}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (ids.length === 0) move(dragId, group, null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              finish();
            }}
          >
            <h3 id={`group-${group}`} className="border-b border-slate-200 px-5 py-3 font-bold text-brand-900">
              {ROLE_IN_ACTIVITY_LABELS[group]} <span className="text-sm font-normal text-slate-500">({ids.length})</span>
            </h3>
            {ids.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">
                {dragId ? "Zet de stakeholder hier neer." : "Geen stakeholders in deze groep."}
              </p>
            ) : (
              <StakeholderTableShell canWrite={canWrite}>
                {ids.map((sid) => {
                  const s = byId.get(sid);
                  if (!s) return null;
                  const isOpen = expanded.has(sid);
                  return (
                    <Fragment key={sid}>
                      <StakeholderTableRow
                        s={s}
                        projectId={projectId}
                        canWrite={canWrite}
                        earlierPhaseIncomplete={earlierPhaseIncomplete}
                        isOpen={isOpen}
                        onToggle={() => toggle(sid)}
                        drag={{
                          isDragging: dragId === sid,
                          onDragStart: () => setDragId(sid),
                          onDragOverRow: (position) => {
                            const current = dragRef.current;
                            if (!current || current === sid) return;
                            const list = groupsRef.current[group].filter((x) => x !== current);
                            const beforeId = position === "before" ? sid : (list[list.indexOf(sid) + 1] ?? null);
                            move(current, group, beforeId);
                          },
                          onDragEnd: cancel,
                        }}
                      />
                      {isOpen && <StakeholderDetailRow s={s} projectId={projectId} canWrite={canWrite} colSpan={canWrite ? 7 : 5} />}
                    </Fragment>
                  );
                })}
              </StakeholderTableShell>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Table with the standard stakeholder columns. */
export function StakeholderTableShell({
  canWrite,
  extraHeader,
  children,
}: {
  canWrite: boolean;
  extraHeader?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
          <tr>
            {canWrite && <th className="w-8" aria-label="Verplaatsen" />}
            <th className="px-3 py-2 font-semibold">Naam / organisatie</th>
            <th className="px-3 py-2 font-semibold">Contactpersoon</th>
            <th className="px-3 py-2 font-semibold">Deadline</th>
            <th className="px-3 py-2 font-semibold">Documentatie</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            {extraHeader && <th className="px-3 py-2 font-semibold">{extraHeader}</th>}
            {canWrite && <th className="w-20" aria-label="Acties" />}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function StakeholderTableRow({
  s,
  projectId,
  canWrite,
  earlierPhaseIncomplete,
  isOpen,
  onToggle,
  drag,
  extraCell,
}: {
  s: StakeholderRow;
  projectId: string;
  canWrite: boolean;
  earlierPhaseIncomplete: boolean;
  isOpen: boolean;
  onToggle: () => void;
  drag?: {
    isDragging: boolean;
    onDragStart: () => void;
    onDragOverRow: (position: "before" | "after") => void;
    onDragEnd: () => void;
  };
  extraCell?: ReactNode;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!s.deadline && s.deadline < today && !isComplete(s.status);
  const href = `/projects/${projectId}/stakeholders/${s.id}`;
  const draggable = canWrite && !!drag;
  return (
    <tr
      draggable={draggable}
      onDragStart={(e) => {
        if (!drag) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", s.id);
        drag.onDragStart();
      }}
      onDragOver={(e) => {
        if (!drag) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        drag.onDragOverRow(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragEnd={drag?.onDragEnd}
      className={`border-t border-slate-100 hover:bg-brand-50/50 ${isOpen ? "bg-brand-50/60" : ""} ${drag?.isDragging ? "bg-brand-50 opacity-60" : ""}`}
    >
      {canWrite && (
        <td className={`pl-3 text-slate-400 ${draggable ? "cursor-grab" : ""}`} title={draggable ? "Sleep om te verplaatsen" : undefined}>
          {draggable && <GripIcon />}
        </td>
      )}
      <td className="px-3 py-2.5">
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={`details-${s.id}`}
            title={isOpen ? "Inklappen" : "Uitklappen"}
            className="mt-0.5 rounded-sm p-0.5 text-brand-700 hover:bg-brand-100"
          >
            <ChevronRightIcon className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <span className="sr-only">
              {isOpen ? "Inklappen" : "Uitklappen"}: {s.name}
            </span>
          </button>
          <div className="min-w-0">
            <Link href={href} className="link font-semibold">
              {s.name}
            </Link>
            {COMMENT_LABELS.filter((l) => (s.labelCounts[l.key] ?? 0) > 0).map((l) => {
              const n = s.labelCounts[l.key];
              return (
                <Link
                  key={l.key}
                  href={`${href}#comments`}
                  title={`${n} comment(s) met het label "${l.label}"`}
                  className={`badge ml-2 align-middle ring-1 hover:opacity-80 ${l.className}`}
                >
                  {l.key === WARNING_LABEL && "⚠ "}
                  {l.label}
                  {n > 1 ? ` (${n})` : ""}
                </Link>
              );
            })}
            {s.description && <p className="line-clamp-1 text-xs text-slate-500">{s.description}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {s.contactPerson || <span className="text-slate-400">—</span>}
        <div className="flex flex-wrap gap-x-2 text-xs">
          {s.email && (
            <a href={`mailto:${s.email}`} className="link">
              {s.email}
            </a>
          )}
          {s.phone && (
            <a href={`tel:${s.phone}`} className="link">
              {s.phone}
            </a>
          )}
        </div>
      </td>
      <td className={`px-3 py-2.5 whitespace-nowrap ${overdue ? "font-semibold text-red-700" : "text-slate-700"}`}>
        {formatDate(s.deadline) || <span className="text-slate-400">—</span>}
        {overdue && <span className="block text-xs">verlopen</span>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {s.docCount > 0 ? (
          <button type="button" onClick={onToggle} className="link inline-flex items-center gap-1">
            <PaperclipIcon className="h-3.5 w-3.5" />
            {s.docCount} item{s.docCount === 1 ? "" : "s"}
          </button>
        ) : canWrite ? (
          <Link href={`${href}#documentatie`} className="link inline-flex items-center gap-1">
            <PaperclipIcon className="h-3.5 w-3.5" /> Toevoegen
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusSelect
          stakeholderId={s.id}
          version={s.version}
          status={s.status}
          disabled={!canWrite}
          earlierPhaseIncomplete={earlierPhaseIncomplete}
        />
      </td>
      {extraCell !== undefined && <td className="px-3 py-2.5">{extraCell}</td>}
      {canWrite && (
        <td className="pr-3 text-right whitespace-nowrap">
          <ContactDialog stakeholder={s} />
          <ActionButton
            className="btn-ghost p-1.5 text-slate-500 hover:text-red-700"
            confirm={`Stakeholder "${s.name}" verwijderen? Een admin kan dit terugzetten via Geschiedenis.`}
            run={() => deleteStakeholder(s.id, s.version)}
          >
            <TrashIcon />
            <span className="sr-only">Verwijder {s.name}</span>
          </ActionButton>
        </td>
      )}
    </tr>
  );
}

/** Expanded panel under a stakeholder: description, background preview and documentation. */
export function StakeholderDetailRow({
  s,
  projectId,
  canWrite,
  colSpan,
}: {
  s: StakeholderRow;
  projectId: string;
  canWrite: boolean;
  colSpan: number;
}) {
  const href = `/projects/${projectId}/stakeholders/${s.id}`;
  // First paragraph of the background (skipping "## " headings) as a short preview.
  const intro = s.profile
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("## ") && !l.startsWith("• "));
  return (
    <tr id={`details-${s.id}`} className="bg-brand-50/40">
      <td colSpan={colSpan} className="px-5 pt-1 pb-4">
        <div className="grid gap-4 border-l-4 border-brand-600 pl-4 md:grid-cols-2">
          <div>
            {s.description && (
              <>
                <h4 className="mb-1 text-sm font-bold text-brand-900">Omschrijving</h4>
                <p className="mb-3 text-sm whitespace-pre-wrap text-slate-700">{s.description}</p>
              </>
            )}
            <h4 className="mb-1 text-sm font-bold text-brand-900">Over deze stakeholder</h4>
            {intro ? (
              <p className="line-clamp-4 text-sm text-slate-800">{intro}</p>
            ) : (
              <p className="text-sm text-slate-500">Nog geen achtergrondinformatie.</p>
            )}
            <Link href={href} className="link mt-1 inline-block text-sm font-semibold">
              Meer over deze stakeholder →
            </Link>
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold text-brand-900">Documentatie</h4>
            {s.links.length === 0 && s.files.length === 0 ? (
              <p className="text-sm text-slate-500">Nog geen documentatie.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {s.links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1.5 font-semibold">
                      <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                      {l.title}
                    </a>
                    {l.description && <p className="pl-5 text-xs text-slate-500">{l.description}</p>}
                  </li>
                ))}
                {s.files.map((file) => (
                  <li key={file.id}>
                    <a href={`/files/${file.id}`} className="link inline-flex items-center gap-1.5">
                      <FileIcon className="h-3.5 w-3.5 shrink-0" />
                      {file.filename} <span className="text-xs text-slate-500">({formatBytes(file.size)})</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`${href}#documentatie`} className="link mt-2 inline-block text-sm font-semibold">
              {canWrite ? "Documentatie toevoegen of beheren →" : "Naar stakeholder →"}
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}
