import { ProjectForm } from "@/components/ProjectForm";
import { getProject } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";
import { DeleteProjectButton } from "./delete-button";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("admin");
  const { id } = await params;
  const project = await getProject(id);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="card p-5">
        {/* key on version so the form shows fresh values after saving */}
        <ProjectForm key={project.version} project={project} />
      </div>
      <div className="card border-red-200 p-5">
        <h2 className="mb-1 font-semibold text-red-800">Project verwijderen</h2>
        <p className="mb-3 text-sm text-slate-600">
          Het project verdwijnt uit het overzicht. Wil je het alleen opbergen, zet dan de status op
          &quot;Gearchiveerd&quot;.
        </p>
        <DeleteProjectButton projectId={project.id} version={project.version} name={project.name} />
      </div>
    </div>
  );
}
