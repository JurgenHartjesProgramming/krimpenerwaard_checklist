import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/history";
import { formatDateTime, ROLE_IN_ACTIVITY_LABELS } from "@/lib/labels";
import { getStakeholderDetail } from "@/lib/queries";
import { hasRole, requirePageUser } from "@/lib/session";
import { Comments } from "@/components/Comments";
import { StatusSelect } from "@/components/StatusSelect";
import { ContactSummary, StakeholderInfo } from "./editor";
import { Documentation } from "@/components/Documentation";
import { MoveToActivity } from "./move-phase";

export default async function StakeholderPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const user = await requirePageUser();
  const { id, sid } = await params;
  const d = await getStakeholderDetail(id, sid).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canWrite = hasRole(user, "editor") && d.project.status !== "archived";

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="space-y-2">
          <Link
            href={d.activity ? `/projects/${id}/activities/${d.activity.id}` : `/projects/${id}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            ← Terug naar {d.activity ? "activiteit" : "overzicht"}
          </Link>
          <h2 className="text-2xl font-bold text-brand-900">{d.stakeholder.name}</h2>
          <p className="text-sm text-slate-600">
            {d.phase?.name}
            {d.activity ? (
              <>
                {" › "}
                {`${d.activity.number} ${d.activity.name}`.trim()} · {ROLE_IN_ACTIVITY_LABELS[d.stakeholder.role]}
              </>
            ) : (
              " › nog niet gekoppeld aan een activiteit"
            )}
          </p>
          <ContactSummary
            stakeholder={d.stakeholder}
            projectId={id}
            backHref={d.activity ? `/projects/${id}/activities/${d.activity.id}` : `/projects/${id}`}
            canWrite={canWrite}
          />
          {canWrite && (
            <MoveToActivity
              stakeholderId={d.stakeholder.id}
              currentActivityId={d.stakeholder.activityId}
              currentRole={d.stakeholder.role}
              options={d.activityOptions}
            />
          )}
        </div>
        <div className="text-right">
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</p>
          <StatusSelect
            stakeholderId={d.stakeholder.id}
            version={d.stakeholder.version}
            status={d.stakeholder.status}
            disabled={!canWrite}
            earlierPhaseIncomplete={d.earlierPhaseIncomplete}
          />
          {d.stakeholder.statusChangedAt && (
            <p className="mt-1 text-xs text-slate-500">
              Gewijzigd door {d.statusChangedByName ?? "onbekend"} op {formatDateTime(d.stakeholder.statusChangedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <StakeholderInfo stakeholder={d.stakeholder} canWrite={canWrite} />
        </div>
        <div className="space-y-5">
          <section id="documentatie" className="card scroll-mt-24 p-5">
            <h3 className="mb-3 text-lg font-bold text-brand-900">
              Documentatie <span className="text-sm font-normal text-slate-500">({d.links.length + d.files.length})</span>
            </h3>
            <Documentation target={{ stakeholderId: sid }} links={d.links} files={d.files} canWrite={canWrite} />
          </section>
          <section id="comments" className="card scroll-mt-24 p-5">
            <h3 className="mb-3 text-lg font-bold text-brand-900">Comments</h3>
            <Comments
              comments={d.comments}
              target={{ stakeholderId: sid }}
              currentUserId={user.id}
              canWrite={canWrite}
              isAdmin={hasRole(user, "admin")}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
