import Link from "next/link";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { listProjects } from "@/lib/queries";
import { formatDate, PROJECT_STATUS_LABELS } from "@/lib/labels";
import { hasRole, requirePageUser } from "@/lib/session";
import type { ProjectStatus } from "@/db/schema";

const STATUS_FILTERS: (ProjectStatus | "all")[] = ["all", "active", "on_hold", "completed", "archived"];

const STATUS_BADGE: Record<ProjectStatus, string> = {
  active: "bg-brand-100 text-brand-900",
  on_hold: "bg-amber-100 text-amber-900",
  completed: "bg-sky-100 text-sky-900",
  archived: "bg-slate-200 text-slate-700",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requirePageUser();
  const { q = "", status = "all" } = await searchParams;
  const rows = await listProjects({ includeArchived: status === "archived" });
  const query = q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (status === "all" ? r.project.status !== "archived" : r.project.status === status) &&
      (query === "" || r.project.name.toLowerCase().includes(query)),
  );

  return (
    <>
      <PageHero
        size="large"
        title="Projecten"
        intro="Houd per project bij welke stakeholders in welke fase benaderd moeten worden."
      >
        {hasRole(user, "admin") && (
          <Link href="/projects/new" className="btn bg-accent-500 text-brand-900 hover:bg-amber-300">
            <PlusIcon /> Nieuw project
          </Link>
        )}
      </PageHero>

      {/* relative z-10: the card overlaps the banner, which is positioned and would otherwise paint on top */}
      <div className="container-page relative z-10 -mt-8 space-y-6">
        <form role="search" className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="label">
              Zoek een project
            </label>
            <input id="q" name="q" defaultValue={q} placeholder="Projectnaam…" className="input" />
          </div>
          <div>
            <label htmlFor="status" className="label">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className="input w-auto">
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "Alle (excl. gearchiveerd)" : PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary">Zoeken</button>
        </form>

        <p className="text-sm text-slate-600" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "project" : "projecten"} gevonden
        </p>

        {filtered.length === 0 ? (
          <p className="card p-6 text-slate-600">Geen projecten gevonden.</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ project, progress, currentPhase, phaseCount }) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="card group flex h-full flex-col border-t-4 border-t-brand-700 p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold text-brand-900 group-hover:underline">{project.name}</h2>
                    <span className={`badge ${STATUS_BADGE[project.status]}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
                  </div>
                  {project.leaderName && <p className="text-sm text-slate-600">Projectleider: {project.leaderName}</p>}
                  {(project.startDate || project.endDate) && (
                    <p className="text-sm text-slate-600">
                      {formatDate(project.startDate)} – {formatDate(project.endDate)}
                    </p>
                  )}
                  <div className="mt-auto pt-4">
                    <div className="mb-1 flex justify-between text-sm text-slate-700">
                      <span>
                        {progress.complete}/{progress.total} activiteiten afgerond
                      </span>
                      <span className="font-semibold">{progress.percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-brand-600" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <p className="mt-3 flex items-center justify-between text-sm text-slate-700">
                      <span>
                        {phaseCount === 0
                          ? "Nog geen fases"
                          : currentPhase
                            ? `Huidige fase: ${currentPhase.name}`
                            : "Alle fases afgerond"}
                      </span>
                      <ChevronRightIcon className="h-4 w-4 text-brand-700" />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
