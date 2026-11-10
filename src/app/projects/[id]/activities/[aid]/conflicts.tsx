"use client";

import { useId, useState } from "react";
import { createActivityConflict, deleteActivityConflict, updateActivityConflict } from "@/actions/checklist";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Linkify } from "@/components/Linkify";
import type { ActivityConflict } from "@/db/schema";

const SEVERITY_STYLE: Record<string, string> = {
  hoog: "bg-red-100 text-red-800 ring-red-300",
  middel: "bg-amber-100 text-amber-900 ring-amber-300",
  laag: "bg-slate-100 text-slate-700 ring-slate-300",
};

/** Conflicts of interest in this activity: which sides clash, why, and possible solutions. */
export function ActivityConflicts({
  activityId,
  conflicts,
  canWrite,
}: {
  activityId: string;
  conflicts: ActivityConflict[];
  canWrite: boolean;
}) {
  return (
    <section aria-labelledby="conflicts-heading" className="card p-5">
      <h2 id="conflicts-heading" className="mb-1 text-xl font-bold text-brand-900">
        Belangenconflicten <span className="text-sm font-normal text-slate-500">({conflicts.length})</span>
      </h2>
      <p className="mb-4 text-sm text-slate-600">Waar de belangen van de betrokken partijen in deze activiteit botsen, en waarom.</p>
      {conflicts.length === 0 ? (
        <p className="text-sm text-slate-500">Geen belangenconflicten bekend voor deze activiteit.</p>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => (
            <ConflictItem key={c.id} conflict={c} canWrite={canWrite} />
          ))}
        </ul>
      )}
      {canWrite && (
        <details className="mt-4">
          <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-700">
            <PlusIcon /> Belangenconflict toevoegen
          </summary>
          <ActionForm action={createActivityConflict} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="activityId" value={activityId} />
            <ConflictFields />
            <div className="sm:col-span-2">
              <button className="btn-primary">Toevoegen</button>
            </div>
          </ActionForm>
        </details>
      )}
    </section>
  );
}

function ConflictItem({ conflict: c, canWrite }: { conflict: ActivityConflict; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const severity = SEVERITY_STYLE[c.severity.trim().toLowerCase()] ?? SEVERITY_STYLE.laag;

  if (editing) {
    return (
      <li className="rounded-sm border border-slate-200 p-4">
        <ActionForm key={c.version} action={updateActivityConflict} onSuccess={() => setEditing(false)} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="version" value={c.version} />
          <ConflictFields conflict={c} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary">Opslaan</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              Annuleren
            </button>
          </div>
        </ActionForm>
      </li>
    );
  }

  return (
    <li className="rounded-sm border border-slate-200 border-l-4 border-l-amber-400 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold text-slate-900">
          {c.title}
        </h3>
        <div className="flex items-center gap-1">
          {c.severity && <span className={`badge ring-1 ${severity}`}>Ernst: {c.severity}</span>}
          {c.theme && <span className="badge bg-sky-50 text-sky-900 ring-1 ring-sky-200">{c.theme}</span>}
          {canWrite && (
            <>
              <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(true)} title="Bewerken">
                <PencilIcon />
                <span className="sr-only">Bewerk {c.title}</span>
              </button>
              <ActionButton
                className="btn-ghost p-1.5 text-slate-500 hover:text-red-700"
                confirm={`Belangenconflict "${c.title}" verwijderen? Een admin kan dit terugzetten.`}
                run={() => deleteActivityConflict(c.id, c.version)}
              >
                <TrashIcon />
                <span className="sr-only">Verwijder {c.title}</span>
              </ActionButton>
            </>
          )}
        </div>
      </div>
      {(c.sideA || c.sideB) && (
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <p className="rounded-sm bg-slate-50 px-3 py-2">
            <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">Kant A</span>
            {c.sideA || "—"}
          </p>
          <p className="rounded-sm bg-slate-50 px-3 py-2">
            <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">Kant B</span>
            {c.sideB || "—"}
          </p>
        </div>
      )}
      {c.why && (
        <div className="mt-3">
          <h4 className="text-sm font-bold text-brand-900">Waarom botsen de belangen?</h4>
          <p className="text-sm text-slate-800">
            <Linkify text={c.why} />
          </p>
        </div>
      )}
      {c.solutions && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">Mogelijke oplossingsrichtingen</summary>
          <p className="mt-1 text-sm text-slate-800">
            <Linkify text={c.solutions} />
          </p>
        </details>
      )}
    </li>
  );
}

function ConflictFields({ conflict }: { conflict?: ActivityConflict }) {
  const p = useId();
  return (
    <>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}title`}>
          Belangenconflict *
        </label>
        <input id={`${p}title`} name="title" required defaultValue={conflict?.title} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}severity`}>
          Ernst
        </label>
        <select id={`${p}severity`} name="severity" defaultValue={conflict?.severity ?? ""} className="input">
          <option value="">—</option>
          <option value="Hoog">Hoog</option>
          <option value="Middel">Middel</option>
          <option value="Laag">Laag</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${p}theme`}>
          Thema
        </label>
        <input id={`${p}theme`} name="theme" defaultValue={conflict?.theme} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}sideA`}>
          Kant A
        </label>
        <input id={`${p}sideA`} name="sideA" defaultValue={conflict?.sideA} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}sideB`}>
          Kant B
        </label>
        <input id={`${p}sideB`} name="sideB" defaultValue={conflict?.sideB} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}why`}>
          Waarom botsen de belangen?
        </label>
        <textarea id={`${p}why`} name="why" rows={3} defaultValue={conflict?.why} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}solutions`}>
          Mogelijke oplossingsrichtingen
        </label>
        <textarea id={`${p}solutions`} name="solutions" rows={3} defaultValue={conflict?.solutions} className="input" />
      </div>
    </>
  );
}
