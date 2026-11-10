import { PageHero } from "@/components/PageHero";
import { ProjectForm } from "@/components/ProjectForm";
import { requirePageUser } from "@/lib/session";

export default async function NewProjectPage() {
  await requirePageUser("admin");
  return (
    <>
      <PageHero title="Nieuw project" crumbs={[{ label: "Projecten", href: "/" }, { label: "Nieuw project" }]} />
      <div className="container-page max-w-3xl space-y-4 pt-6">
        <div className="card p-6">
          <ProjectForm />
        </div>
        <p className="text-sm text-slate-600">
          Na het aanmaken kun je fases en stakeholders toevoegen, of ze kopiëren uit een ander project.
        </p>
      </div>
    </>
  );
}
