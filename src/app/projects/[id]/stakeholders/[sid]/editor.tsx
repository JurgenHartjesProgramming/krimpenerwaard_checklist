"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { deleteStakeholder, updateActivities, updateProfile } from "@/actions/checklist";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { ContactDialog } from "@/components/ContactDialog";
import { PencilIcon } from "@/components/icons";
import { Linkify } from "@/components/Linkify";
import type { Stakeholder } from "@/db/schema";
import type { ActionResult } from "@/lib/action";
import { formatDate } from "@/lib/labels";

/** One-line contact summary with the pencil (pop-up) and delete button. */
export function ContactSummary({ stakeholder: s, projectId, backHref, canWrite }: {
  stakeholder: Stakeholder;
  projectId: string;
  backHref: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const items = [
    s.contactPerson && <span key="c">{s.contactPerson}</span>,
    s.email && (
      <a key="e" className="link" href={`mailto:${s.email}`}>
        {s.email}
      </a>
    ),
    s.phone && (
      <a key="p" className="link" href={`tel:${s.phone}`}>
        {s.phone}
      </a>
    ),
    s.deadline && <span key="d">Deadline: {formatDate(s.deadline)}</span>,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
      {items.length > 0 ? items : <span className="text-slate-500">Nog geen contactgegevens.</span>}
      {canWrite && (
        <span className="flex items-center">
          <ContactDialog stakeholder={s} className="btn-ghost px-2 py-1 text-xs" />
          <ActionButton
            className="btn-ghost px-2 py-1 text-xs text-red-700"
            confirm={`Stakeholder "${s.name}" verwijderen? Een admin kan dit terugzetten.`}
            run={() => deleteStakeholder(s.id, s.version)}
            onSuccess={() => router.push(backHref || `/projects/${projectId}`)}
          >
            Verwijderen
          </ActionButton>
        </span>
      )}
      {s.description && <p className="w-full text-slate-600">{s.description}</p>}
    </div>
  );
}

/**
 * Renders profile text: lines starting with "## " become sub-headings, "• " list items,
 * everything else paragraphs (with clickable links).
 */
export function ProfileText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="list-disc space-y-1 pl-5">
          {list.map((item, i) => (
            <li key={i}>
              <Linkify text={item} />
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h4 key={`h${blocks.length}`} className="pt-1 font-bold text-brand-900">
          {line.slice(3)}
        </h4>,
      );
    } else if (line.startsWith("• ") || line.startsWith("- ")) {
      list.push(line.slice(2));
    } else {
      flush();
      blocks.push(
        <p key={`p${blocks.length}`}>
          <Linkify text={line} />
        </p>,
      );
    }
  }
  flush();
  return <div className="space-y-2 text-[15px] text-slate-800">{blocks}</div>;
}

/** A card with read view + edit form for one long text field of a stakeholder. */
function TextCard({
  title,
  hint,
  value,
  emptyText,
  canWrite,
  action,
  field,
  stakeholder: s,
  render,
  rows = 8,
}: {
  title: string;
  hint?: string;
  value: string;
  emptyText: string;
  canWrite: boolean;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  field: "profile" | "activities";
  stakeholder: Stakeholder;
  render: (text: string) => ReactNode;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="card p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-brand-900">{title}</h3>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        {canWrite && !editing && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(true)}>
            <PencilIcon className="h-3.5 w-3.5" /> {value ? "Bewerken" : "Invullen"}
          </button>
        )}
      </div>
      {editing ? (
        <ActionForm key={s.version} action={action} onSuccess={() => setEditing(false)} className="space-y-2">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="version" value={s.version} />
          <textarea name={field} rows={rows} defaultValue={value} aria-label={title} className="input" autoFocus />
          <div className="flex gap-2">
            <button className="btn-primary">Opslaan</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              Annuleren
            </button>
          </div>
        </ActionForm>
      ) : value ? (
        render(value)
      ) : (
        <p className="text-sm text-slate-500">{emptyText}</p>
      )}
    </section>
  );
}

/** Left column of the stakeholder page: background and the stakeholder's activity log. */
export function StakeholderInfo({ stakeholder: s, canWrite }: { stakeholder: Stakeholder; canWrite: boolean }) {
  return (
    <>
      <TextCard
        title="Over deze stakeholder"
        hint="Rol, wettelijke verplichtingen en beleidskaders. Tip: begin een regel met ## voor een tussenkopje en met • voor een opsomming."
        value={s.profile}
        emptyText="Nog geen achtergrondinformatie."
        canWrite={canWrite}
        action={updateProfile}
        field="profile"
        stakeholder={s}
        render={(t) => <ProfileText text={t} />}
        rows={14}
      />
      <TextCard
        title="Activiteiten"
        hint="Lopend verslag van wat er met deze stakeholder moet gebeuren of is gebeurd."
        value={s.activities}
        emptyText="Nog niets vastgelegd."
        canWrite={canWrite}
        action={updateActivities}
        field="activities"
        stakeholder={s}
        render={(t) => (
          <p className="text-sm text-slate-800">
            <Linkify text={t} />
          </p>
        )}
      />
    </>
  );
}
