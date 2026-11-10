import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityStatusSelect } from "@/components/ActivityStatusSelect";
import { Comments } from "@/components/Comments";
import { ChevronRightIcon } from "@/components/icons";
import { ActivityStakeholders } from "@/components/StakeholderTable";
import { NotFoundError } from "@/lib/history";
import { formatDateTime } from "@/lib/labels";
import { getActivityDetail } from "@/lib/queries";
import { hasRole, requirePageUser } from "@/lib/session";
import { ActivityDetails, AddStakeholder } from "./activity-editor";
import { ActivityConflicts } from "./conflicts";

export default async function ActivityPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const user = await requirePageUser();
  const { id, aid } = await params;
  const d = await getActivityDetail(id, aid).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canWrite = hasRole(user, "editor") && d.project.status !== "archived";
  const label = (a: { number: string; name: string }) => `${a.number} ${a.name}`.trim();

  return (
    <div className="space-y-5">
      <nav aria-label="Navigatie activiteiten" className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={`/projects/${id}`} className="font-semibold text-brand-700 hover:underline">
          ← Terug naar overzicht
        </Link>
        <span className="flex gap-3">
          {d.previous && (
            <Link href={`/projects/${id}/activities/${d.previous.id}`} className="link" title={label(d.previous)}>
              ← Vorige activiteit
            </Link>
          )}
          {d.next && (
            <Link href={`/projects/${id}/activities/${d.next.id}`} className="link inline-flex items-center" title={label(d.next)}>
              Volgende activiteit <ChevronRightIcon className="h-4 w-4" />
            </Link>
          )}
        </span>
      </nav>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Fase: {d.phase.name}</p>
            <h2 className="text-2xl font-bold text-brand-900">
              {d.activity.number && <span className="mr-2 text-slate-500 tabular-nums">{d.activity.number}</span>}
              {d.activity.name}
            </h2>
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</p>
            <ActivityStatusSelect
              activityId={d.activity.id}
              version={d.activity.version}
              status={d.activity.status}
              disabled={!canWrite}
              earlierPhaseIncomplete={d.earlierPhaseIncomplete}
            />
            {d.activity.statusChangedAt && (
              <p className="mt-1 text-xs text-slate-500">
                Gewijzigd door {d.statusChangedByName ?? "onbekend"} op {formatDateTime(d.activity.statusChangedAt)}
              </p>
            )}
          </div>
        </div>
        <ActivityDetails activity={d.activity} projectId={id} canWrite={canWrite} />
      </div>

      <ActivityConflicts activityId={d.activity.id} conflicts={d.conflicts} canWrite={canWrite} />

      <section aria-labelledby="stakeholders-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="stakeholders-heading" className="text-xl font-bold text-brand-900">
            Stakeholders <span className="text-sm font-normal text-slate-500">({d.stakeholders.length})</span>
          </h2>
        </div>
        <ActivityStakeholders
          activityId={d.activity.id}
          projectId={id}
          stakeholders={d.stakeholders}
          canWrite={canWrite}
          earlierPhaseIncomplete={d.earlierPhaseIncomplete}
        />
        {canWrite && <AddStakeholder activityId={d.activity.id} existing={d.existingStakeholders} />}
      </section>

      <section id="comments" aria-labelledby="activity-comments-heading" className="card scroll-mt-24 p-5">
        <h2 id="activity-comments-heading" className="mb-3 text-xl font-bold text-brand-900">
          Comments bij deze activiteit <span className="text-sm font-normal text-slate-500">({d.comments.length})</span>
        </h2>
        <Comments
          comments={d.comments}
          target={{ activityId: d.activity.id }}
          currentUserId={user.id}
          canWrite={canWrite}
          isAdmin={hasRole(user, "admin")}
        />
      </section>
    </div>
  );
}
