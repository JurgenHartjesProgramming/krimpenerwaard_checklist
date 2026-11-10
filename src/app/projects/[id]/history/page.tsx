import { db } from "@/db";
import { changedFields, projectHistory } from "@/lib/history";
import { ENTITY_LABELS, FIELD_LABELS, formatDateTime, STAKEHOLDER_STATUS_LABELS } from "@/lib/labels";
import { hasRole, requirePageUser } from "@/lib/session";
import type { StakeholderStatus } from "@/db/schema";
import { RestoreForm, RevertButton, RestoreToMomentButton } from "./controls";

type Snapshot = Record<string, unknown> | null;

function entityName(s: Snapshot): string {
  if (!s) return "";
  const v = s.name ?? s.title ?? s.filename ?? s.body;
  const text = typeof v === "string" ? v : "";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function describe(op: string, before: Snapshot, after: Snapshot): string {
  if (op === "create") return "aangemaakt";
  if (op === "delete") return "verwijderd";
  const fields = changedFields(before, after);
  if (fields.includes("deletedAt")) return after?.deletedAt ? "verwijderd (door terugzetten)" : "hersteld";
  const visible = fields.filter((f) => !["statusChangedBy", "statusChangedAt", "editedAt"].includes(f));
  if (visible.length === 1 && visible[0] === "status" && before && after) {
    const from = STAKEHOLDER_STATUS_LABELS[before.status as StakeholderStatus] ?? before.status;
    const to = STAKEHOLDER_STATUS_LABELS[after.status as StakeholderStatus] ?? after.status;
    return `status: ${from} → ${to}`;
  }
  return `gewijzigd: ${visible.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`;
}

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const rows = await projectHistory(db, id);
  const isAdmin = hasRole(user, "admin");

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="card p-4">
          <h2 className="mb-1 font-semibold">Project terugzetten naar een tijdstip</h2>
          <p className="mb-3 text-sm text-slate-600">
            Alle fases, stakeholders, documentatie en comments worden teruggezet naar de stand op dat moment. Dit
            wordt zelf ook als wijziging vastgelegd, dus het is weer ongedaan te maken.
          </p>
          <RestoreForm projectId={id} />
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {rows.length === 0 && <p className="p-4 text-sm text-slate-500">Nog geen wijzigingen.</p>}
        {rows.map(({ event, actorName }, i) => {
          const before = event.before as Snapshot;
          const after = event.after as Snapshot;
          const newBatch = i === 0 || rows[i - 1].event.batchId !== event.batchId;
          return (
            <div key={event.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-2.5 ${newBatch ? "" : "pl-8"}`}>
              <div className="min-w-0 text-sm">
                {newBatch && event.note && <p className="mb-0.5 text-xs font-medium text-brand-700">{event.note}</p>}
                <p>
                  <span className="text-slate-500">{ENTITY_LABELS[event.entityType] ?? event.entityType}</span>{" "}
                  <span className="font-medium">{entityName(after ?? before)}</span> {describe(event.op, before, after)}
                </p>
                <p className="text-xs text-slate-500">
                  #{event.id} · {actorName ?? "onbekend"} · {formatDateTime(event.createdAt)}
                </p>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 gap-1">
                  <RevertButton eventId={event.id} />
                  {newBatch && <RestoreToMomentButton projectId={id} at={event.createdAt.toISOString()} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
