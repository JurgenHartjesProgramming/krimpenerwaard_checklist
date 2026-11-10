"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copyFromProject } from "@/actions/admin";

interface SourcePhase {
  id: string;
  name: string;
  activities: { id: string; name: string; stakeholderCount: number }[];
}

export function CopyForm({
  targetProjectId,
  sourceProjectId,
  phases,
}: {
  targetProjectId: string;
  sourceProjectId: string;
  phases: SourcePhase[];
}) {
  const router = useRouter();
  const [phaseIds, setPhaseIds] = useState<Set<string>>(new Set());
  const [activityIds, setActivityIds] = useState<Set<string>>(new Set());
  const [includeComments, setIncludeComments] = useState(false);
  const [includeProjectDocs, setIncludeProjectDocs] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function togglePhase(p: SourcePhase, on: boolean) {
    const nextPhases = new Set(phaseIds);
    const nextStakeholders = new Set(activityIds);
    if (on) nextPhases.add(p.id);
    else nextPhases.delete(p.id);
    for (const s of p.activities) {
      if (on) nextStakeholders.add(s.id);
      else nextStakeholders.delete(s.id);
    }
    setPhaseIds(nextPhases);
    setActivityIds(nextStakeholders);
  }

  function toggleActivity(id: string, on: boolean) {
    const next = new Set(activityIds);
    if (on) next.add(id);
    else next.delete(id);
    setActivityIds(next);
  }

  const nothingSelected = phaseIds.size === 0 && activityIds.size === 0 && !includeProjectDocs;

  if (phases.length === 0) return <p className="card p-4 text-sm text-slate-500">Dit project heeft geen fases.</p>;

  return (
    <div className="card space-y-4 p-4">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            setPhaseIds(new Set(phases.map((p) => p.id)));
            setActivityIds(new Set(phases.flatMap((p) => p.activities.map((s) => s.id))));
          }}
        >
          Alles selecteren
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            setPhaseIds(new Set());
            setActivityIds(new Set());
          }}
        >
          Niets selecteren
        </button>
      </div>
      <ul className="space-y-3">
        {phases.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={phaseIds.has(p.id)} onChange={(e) => togglePhase(p, e.target.checked)} />
              {p.name}
              <span className="text-xs font-normal text-slate-500">(hele fase)</span>
            </label>
            <ul className="mt-1 ml-6 space-y-1">
              {p.activities.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={activityIds.has(s.id)}
                      onChange={(e) => toggleActivity(s.id, e.target.checked)}
                    />
                    {s.name}
                    <span className="text-xs text-slate-500">({s.stakeholderCount} stakeholders)</span>
                  </label>
                </li>
              ))}
              {p.activities.length === 0 && <li className="text-xs text-slate-500">Geen activiteiten</li>}
            </ul>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
        <input type="checkbox" checked={includeComments} onChange={(e) => setIncludeComments(e.target.checked)} />
        Comments meenemen
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeProjectDocs} onChange={(e) => setIncludeProjectDocs(e.target.checked)} />
        Projectdocumenten meenemen (tabblad Documenten)
      </label>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button
        type="button"
        className="btn-primary"
        disabled={pending || nothingSelected}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await copyFromProject({
              targetProjectId,
              sourceProjectId,
              phaseIds: [...phaseIds],
              activityIds: [...activityIds],
              includeComments,
              includeProjectDocs,
            });
            if (!r.ok) {
              setError(r.error);
              return;
            }
            window.alert(
              `Gekopieerd: ${r.data?.phaseCount ?? 0} nieuwe fases, ${r.data?.activityCount ?? 0} activiteiten, ${r.data?.stakeholderCount ?? 0} stakeholders en ${r.data?.projectDocCount ?? 0} projectdocumenten.`,
            );
            router.push(`/projects/${targetProjectId}`);
            router.refresh();
          })
        }
      >
        Kopiëren naar dit project
      </button>
    </div>
  );
}
