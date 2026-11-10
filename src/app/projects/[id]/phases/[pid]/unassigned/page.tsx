import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/history";
import { getUnassignedStakeholders } from "@/lib/queries";
import { hasRole, requirePageUser } from "@/lib/session";
import { UnassignedList } from "./unassigned-list";

/** Stakeholders of a phase that are not yet linked to an activity (data from before activities existed). */
export default async function UnassignedPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const user = await requirePageUser();
  const { id, pid } = await params;
  const d = await getUnassignedStakeholders(id, pid).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canWrite = hasRole(user, "editor") && d.project.status !== "archived";

  return (
    <div className="space-y-4">
      <Link href={`/projects/${id}`} className="text-sm font-semibold text-brand-700 hover:underline">
        ← Terug naar overzicht
      </Link>
      <div className="card p-5">
        <h2 className="text-xl font-bold text-brand-900">Stakeholders zonder activiteit — {d.phase.name}</h2>
        <p className="mt-1 text-slate-700">
          Deze stakeholders zijn aangemaakt voordat er activiteiten waren. Koppel ze aan een activiteit en kies of ze
          daar leidend of ook betrokken zijn. Hun status, belangen, documentatie en comments gaan mee.
        </p>
      </div>
      {d.stakeholders.length === 0 ? (
        <p className="card p-5 text-slate-600">Alle stakeholders in deze fase zijn gekoppeld aan een activiteit.</p>
      ) : (
        <UnassignedList projectId={id} stakeholders={d.stakeholders} options={d.activityOptions} canWrite={canWrite} />
      )}
    </div>
  );
}
