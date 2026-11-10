import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { NotFoundError } from "@/lib/history";
import { PROJECT_STATUS_LABELS } from "@/lib/labels";
import { getProject } from "@/lib/queries";
import { hasRole, requirePageUser } from "@/lib/session";
import { ProjectTabs } from "./tabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await getProject(id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const isAdmin = hasRole(user, "admin");

  return (
    <>
      <PageHero title={project.name} crumbs={[{ label: "Projecten", href: "/" }, { label: project.name }]}>
        <span className="badge bg-white/90 text-brand-900">{PROJECT_STATUS_LABELS[project.status]}</span>
      </PageHero>
      <div className="border-b border-slate-200 bg-white">
        <div className="container-page">
          <ProjectTabs projectId={id} isAdmin={isAdmin} />
        </div>
      </div>
      <div className="container-page space-y-5 pt-6">
        {project.status === "archived" && (
          <p className="rounded-sm border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900">
            Dit project is gearchiveerd en daarom alleen-lezen.
          </p>
        )}
        {children}
      </div>
    </>
  );
}
