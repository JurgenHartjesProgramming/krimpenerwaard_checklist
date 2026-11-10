"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createStakeholder, deleteActivity, linkExistingStakeholder, updateActivity } from "@/actions/checklist";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { ActivityFormFields } from "@/components/ActivityFormFields";
import { PencilIcon, PlusIcon } from "@/components/icons";
import { Linkify } from "@/components/Linkify";
import { StakeholderFormFields } from "@/components/StakeholderFormFields";
import type { Activity } from "@/db/schema";
import type { ExistingStakeholderOption } from "@/lib/queries";

/** Description and result of an activity, with an edit form. */
export function ActivityDetails({ activity: a, projectId, canWrite }: { activity: Activity; projectId: string; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ActionForm
        key={a.version}
        action={updateActivity}
        onSuccess={() => setEditing(false)}
        className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2"
      >
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="version" value={a.version} />
        <ActivityFormFields activity={a} />
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary">Opslaan</button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
            Annuleren
          </button>
        </div>
      </ActionForm>
    );
  }

  return (
    <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div>
        <h3 className="mb-1 text-sm font-bold text-brand-900">Beschrijving</h3>
        {a.description ? (
          <p className="text-slate-800">
            <Linkify text={a.description} />
          </p>
        ) : (
          <p className="text-sm text-slate-500">Nog geen beschrijving.</p>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-bold text-brand-900">Resultaat</h3>
        {a.result ? <p className="text-slate-800">{a.result}</p> : <p className="text-sm text-slate-500">Nog niet ingevuld.</p>}
      </div>
      {canWrite && (
        <div className="flex flex-wrap justify-between gap-2 md:col-span-2">
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            <PencilIcon /> Activiteit bewerken
          </button>
          <ActionButton
            confirm={`Activiteit "${a.name}" en de stakeholders erin verwijderen? Een admin kan dit terugzetten via Geschiedenis.`}
            run={() => deleteActivity(a.id, a.version)}
            onSuccess={() => router.push(`/projects/${projectId}`)}
          >
            Activiteit verwijderen
          </ActionButton>
        </div>
      )}
    </div>
  );
}

/**
 * Add a stakeholder to the activity: either link an existing stakeholder from the project
 * (copies name, contact details, background and documentation) or create a completely new one.
 */
export function AddStakeholder({ activityId, existing }: { activityId: string; existing: ExistingStakeholderOption[] }) {
  const [mode, setMode] = useState<"existing" | "new">(existing.length > 0 ? "existing" : "new");
  return (
    <details className="card p-5">
      <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-700">
        <PlusIcon /> Stakeholder toevoegen
      </summary>
      <div role="tablist" aria-label="Soort stakeholder" className="mt-3 mb-4 flex gap-1">
        {(
          [
            ["existing", `Bestaande stakeholder koppelen (${existing.length})`],
            ["new", "Nieuwe stakeholder aanmaken"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`rounded-sm px-3 py-1.5 text-sm font-semibold ${
              mode === key ? "bg-brand-700 text-white" : "text-brand-800 hover:bg-brand-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "existing" ? (
        <LinkExisting activityId={activityId} existing={existing} />
      ) : (
        <ActionForm action={createStakeholder} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="activityId" value={activityId} />
          <RoleChoice name="role" />
          <StakeholderFormFields />
          <div className="sm:col-span-2">
            <button className="btn-primary">Toevoegen</button>
          </div>
        </ActionForm>
      )}
    </details>
  );
}

function RoleChoice({ name, value, onChange }: { name: string; value?: "lead" | "involved"; onChange?: (v: "lead" | "involved") => void }) {
  const controlled = value !== undefined;
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label">Rol in deze activiteit</legend>
      <div className="flex gap-4 text-sm">
        {(
          [
            ["lead", "Leidend"],
            ["involved", "Ook betrokken"],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={name}
              value={v}
              {...(controlled
                ? { checked: value === v, onChange: () => onChange?.(v) }
                : { defaultChecked: v === "involved" })}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LinkExisting({ activityId, existing }: { activityId: string; existing: ExistingStakeholderOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [role, setRole] = useState<"lead" | "involved">("involved");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const q = query.trim().toLowerCase();
  const visible = q ? existing.filter((o) => o.name.toLowerCase().includes(q) || o.contactPerson.toLowerCase().includes(q)) : existing;

  if (existing.length === 0) {
    return <p className="text-sm text-slate-500">Alle stakeholders uit dit project zijn al aan deze activiteit gekoppeld.</p>;
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor={`search-${activityId}`}>
          Zoek een stakeholder
        </label>
        <input
          id={`search-${activityId}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Naam of contactpersoon…"
          className="input"
        />
      </div>
      <ul role="listbox" aria-label="Bestaande stakeholders" className="max-h-72 overflow-y-auto rounded-sm border border-slate-200">
        {visible.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Geen stakeholders gevonden.</li>}
        {visible.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected === o.id}
              onClick={() => setSelected(o.id)}
              className={`flex w-full items-baseline justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                selected === o.id ? "bg-brand-100" : "hover:bg-brand-50"
              }`}
            >
              <span>
                <span className="font-semibold">{o.name}</span>
                {o.contactPerson && <span className="text-slate-500"> · {o.contactPerson}</span>}
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                {o.activities.length > 0 ? `ook bij ${o.activities.join(", ")}` : "zonder activiteit"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <RoleChoice name={`link-role-${activityId}`} value={role} onChange={setRole} />
      <p className="text-xs text-slate-500">
        Naam, contactgegevens, achtergrond en documentatie worden overgenomen. Status, deadline en comments horen bij
        deze activiteit en beginnen leeg.
      </p>
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button
        type="button"
        className="btn-primary"
        disabled={!selected || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await linkExistingStakeholder(activityId, selected, role);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setSelected("");
            setQuery("");
            router.refresh();
          })
        }
      >
        Koppelen aan deze activiteit
      </button>
    </div>
  );
}
