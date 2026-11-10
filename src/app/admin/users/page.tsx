import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAudit, users } from "@/db/schema";
import { formatDateTime, ROLE_LABELS } from "@/lib/labels";
import { requirePageUser } from "@/lib/session";
import { PageHero } from "@/components/PageHero";
import { UserAccessForm } from "./user-access-form";

const STATUS_LABELS = { pending: "In afwachting", active: "Actief", deactivated: "Gedeactiveerd" } as const;

export default async function UsersPage() {
  const me = await requirePageUser("admin");
  const rows = await db
    .select()
    .from(users)
    .orderBy(sql`case ${users.status} when 'pending' then 0 when 'active' then 1 else 2 end`, asc(users.name));

  const actor = alias(users, "actor");
  const target = alias(users, "target");
  const audit = await db
    .select({ entry: adminAudit, actorName: actor.name, targetName: target.name })
    .from(adminAudit)
    .leftJoin(actor, eq(actor.id, adminAudit.actorId))
    .leftJoin(target, eq(target.id, adminAudit.targetUserId))
    .orderBy(desc(adminAudit.id))
    .limit(100);

  return (
    <>
    <PageHero title="Gebruikers" crumbs={[{ label: "Projecten", href: "/" }, { label: "Gebruikers" }]} />
    <div className="container-page space-y-6 pt-6">
      <p className="text-slate-700">
        Nieuwe gebruikers verschijnen hier na hun eerste login als &quot;In afwachting&quot;. Ken een rol toe en
        activeer ze. Gebruikers worden nooit verwijderd, alleen gedeactiveerd.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Naam</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Laatste login</th>
              <th className="px-4 py-2 font-medium">Toegang</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">
                  {u.name}
                  {u.status === "pending" && <span className="badge ml-2 bg-amber-100 text-amber-800">Nieuw</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2 text-slate-600">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-4 py-2">
                  <UserAccessForm userId={u.id} role={u.role} status={u.status} isSelf={u.id === me.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-900">Beheerlog</h2>
        <div className="card divide-y divide-slate-100 text-sm">
          {audit.length === 0 && <p className="p-4 text-slate-500">Nog geen meldingen.</p>}
          {audit.map(({ entry, actorName, targetName }) => (
            <div key={entry.id} className="px-4 py-2">
              <span className="text-slate-500">{formatDateTime(entry.createdAt)}</span> · {describeAudit(entry.action, entry.details, actorName, targetName)}
            </div>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}

function describeAudit(action: string, details: unknown, actorName: string | null, targetName: string | null) {
  if (action === "user_registered") return `${targetName} heeft zich voor het eerst aangemeld`;
  if (action === "initial_admin_created") return `${targetName} is als eerste admin aangemaakt`;
  if (action === "access_changed") {
    const d = details as { from: { role: string | null; status: string }; to: { role: string | null; status: string } };
    const fmt = (x: { role: string | null; status: string }) =>
      `${x.role ? ROLE_LABELS[x.role as keyof typeof ROLE_LABELS] : "geen rol"}, ${STATUS_LABELS[x.status as keyof typeof STATUS_LABELS] ?? x.status}`;
    return `${actorName} wijzigde toegang van ${targetName}: ${fmt(d.from)} → ${fmt(d.to)}`;
  }
  return `${actorName}: ${action}`;
}
