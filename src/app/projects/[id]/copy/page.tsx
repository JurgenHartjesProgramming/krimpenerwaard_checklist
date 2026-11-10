import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, phases, projects, stakeholders } from "@/db/schema";
import { requirePageUser } from "@/lib/session";
import { CopyForm } from "./copy-form";

export default async function CopyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requirePageUser("admin");
  const { id } = await params;
  const { from } = await searchParams;

  const sources = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(ne(projects.id, id), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
  const source = sources.find((s) => s.id === from);

  const tree = source
    ? await (async () => {
        const phaseRows = await db
          .select()
          .from(phases)
          .where(and(eq(phases.projectId, source.id), isNull(phases.deletedAt)))
          .orderBy(asc(phases.sortOrder));
        const activityRows = await db
          .select({ id: activities.id, number: activities.number, name: activities.name, phaseId: activities.phaseId })
          .from(activities)
          .where(and(eq(activities.projectId, source.id), isNull(activities.deletedAt)))
          .orderBy(asc(activities.sortOrder));
        const counts = await db
          .select({ activityId: stakeholders.activityId, n: sql<number>`count(*)::int` })
          .from(stakeholders)
          .where(and(eq(stakeholders.projectId, source.id), isNull(stakeholders.deletedAt)))
          .groupBy(stakeholders.activityId);
        return phaseRows.map((p) => ({
          id: p.id,
          name: p.name,
          activities: activityRows
            .filter((a) => a.phaseId === p.id)
            .map((a) => ({
              id: a.id,
              name: `${a.number} ${a.name}`.trim(),
              stakeholderCount: counts.find((c) => c.activityId === a.id)?.n ?? 0,
            })),
        }));
      })()
    : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card p-4">
        <h2 className="mb-1 font-semibold">Kopiëren uit een ander project</h2>
        <p className="mb-3 text-sm text-slate-600">
          Kies fases en activiteiten. Een activiteit gaat mee met al haar stakeholders (met hun rol, gegevens,
          belangen en documentatie). De status wordt niet overgenomen. Activiteiten in een fase met dezelfde naam als
          een bestaande fase worden aan die fase toegevoegd.
        </p>
        <form className="flex flex-wrap gap-2">
          <select name="from" defaultValue={from ?? ""} className="input w-auto min-w-64">
            <option value="" disabled>
              Kies een bronproject…
            </option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Toon inhoud</button>
        </form>
      </div>
      {source && tree && <CopyForm targetProjectId={id} sourceProjectId={source.id} phases={tree} />}
    </div>
  );
}
