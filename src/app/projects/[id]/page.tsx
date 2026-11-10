import { getProjectBoard } from "@/lib/queries";
import { hasRole, requirePageUser } from "@/lib/session";
import { PhaseBoard } from "@/components/PhaseBoard";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const board = await getProjectBoard(id);
  const readOnly = board.project.status === "archived";

  return (
    <div className="space-y-4">
      {board.project.description && <p className="text-sm whitespace-pre-wrap text-slate-700">{board.project.description}</p>}
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-48 flex-1">
          <div className="mb-1 flex justify-between text-sm text-slate-600">
            <span>
              Voortgang: {board.progress.complete}/{board.progress.total} activiteiten afgerond
            </span>
            <span className="font-medium">{board.progress.percent}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-brand-600" style={{ width: `${board.progress.percent}%` }} />
          </div>
        </div>
        {board.project.leaderName && (
          <p className="text-sm text-slate-600">
            Projectleider:{" "}
            {board.project.leaderEmail ? (
              <a className="link" href={`mailto:${board.project.leaderEmail}`}>
                {board.project.leaderName}
              </a>
            ) : (
              board.project.leaderName
            )}
          </p>
        )}
      </div>
      <PhaseBoard
        projectId={id}
        phases={board.phases}
        canWrite={hasRole(user, "editor") && !readOnly}
        isAdmin={hasRole(user, "admin")}
        currentUserId={user.id}
      />
    </div>
  );
}
