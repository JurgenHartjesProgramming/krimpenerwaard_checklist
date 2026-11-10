import Link from "next/link";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { docFiles, docLinks, phases, stakeholders } from "@/db/schema";
import { Documentation } from "@/components/Documentation";
import { FileIcon, LinkIcon } from "@/components/icons";
import { formatBytes } from "@/lib/files";
import { getProject } from "@/lib/queries";
import { hasRole, requirePageUser } from "@/lib/session";

/** General project documents, plus an overview of all stakeholder documentation in this project. */
export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await getProject(id);
  const canWrite = hasRole(user, "editor") && project.status !== "archived";

  const projectLinks = await db
    .select()
    .from(docLinks)
    .where(and(eq(docLinks.projectId, id), isNull(docLinks.stakeholderId), isNull(docLinks.deletedAt)))
    .orderBy(asc(docLinks.createdAt));
  const projectFiles = await db
    .select()
    .from(docFiles)
    .where(and(eq(docFiles.projectId, id), isNull(docFiles.stakeholderId), isNull(docFiles.deletedAt)))
    .orderBy(asc(docFiles.createdAt));

  // Overview of stakeholder documentation, grouped by phase and stakeholder.
  const stakeholderLinks = await db
    .select({ link: docLinks, stakeholder: stakeholders, phase: phases })
    .from(docLinks)
    .innerJoin(stakeholders, and(eq(stakeholders.id, docLinks.stakeholderId), isNull(stakeholders.deletedAt)))
    .innerJoin(phases, and(eq(phases.id, stakeholders.phaseId), isNull(phases.deletedAt)))
    .where(and(eq(docLinks.projectId, id), isNotNull(docLinks.stakeholderId), isNull(docLinks.deletedAt)))
    .orderBy(asc(phases.sortOrder), asc(stakeholders.sortOrder), asc(docLinks.createdAt));
  const stakeholderFiles = await db
    .select({ file: docFiles, stakeholder: stakeholders, phase: phases })
    .from(docFiles)
    .innerJoin(stakeholders, and(eq(stakeholders.id, docFiles.stakeholderId), isNull(stakeholders.deletedAt)))
    .innerJoin(phases, and(eq(phases.id, stakeholders.phaseId), isNull(phases.deletedAt)))
    .where(and(eq(docFiles.projectId, id), isNotNull(docFiles.stakeholderId), isNull(docFiles.deletedAt)))
    .orderBy(asc(phases.sortOrder), asc(stakeholders.sortOrder), asc(docFiles.createdAt));

  type Group = {
    phaseName: string;
    phaseOrder: number;
    stakeholders: Map<string, { name: string; links: typeof stakeholderLinks; files: typeof stakeholderFiles }>;
  };
  const groups = new Map<string, Group>();
  const groupFor = (phase: typeof phases.$inferSelect, s: typeof stakeholders.$inferSelect) => {
    if (!groups.has(phase.id)) groups.set(phase.id, { phaseName: phase.name, phaseOrder: phase.sortOrder, stakeholders: new Map() });
    const g = groups.get(phase.id)!;
    if (!g.stakeholders.has(s.id)) g.stakeholders.set(s.id, { name: s.name, links: [], files: [] });
    return g.stakeholders.get(s.id)!;
  };
  for (const row of stakeholderLinks) groupFor(row.phase, row.stakeholder).links.push(row);
  for (const row of stakeholderFiles) groupFor(row.phase, row.stakeholder).files.push(row);
  const ordered = [...groups.entries()].sort((a, b) => a[1].phaseOrder - b[1].phaseOrder);
  const stakeholderDocCount = stakeholderLinks.length + stakeholderFiles.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="card h-fit p-5">
        <h2 className="mb-1 text-lg font-bold text-brand-900">
          Projectdocumenten <span className="text-sm font-normal text-slate-500">({projectLinks.length + projectFiles.length})</span>
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Algemene documenten voor het hele project, zoals de projectopdracht, planning of verslagen.
        </p>
        <Documentation target={{ projectId: id }} links={projectLinks} files={projectFiles} canWrite={canWrite} />
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-bold text-brand-900">
          Documentatie per stakeholder <span className="text-sm font-normal text-slate-500">({stakeholderDocCount})</span>
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Overzicht van alle documentatie die bij stakeholders hoort. Toevoegen of wijzigen doe je bij de stakeholder zelf.
        </p>
        {ordered.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen documentatie bij stakeholders.</p>
        ) : (
          <div className="space-y-2">
            {ordered.map(([phaseId, g], i) => (
              <details key={phaseId} className="rounded-sm border border-slate-200">
                <summary className="cursor-pointer bg-slate-50 px-3 py-2 font-semibold text-brand-900">
                  {i + 1}. {g.phaseName}{" "}
                  <span className="text-sm font-normal text-slate-500">({g.stakeholders.size} stakeholders)</span>
                </summary>
                <ul className="divide-y divide-slate-100">
                  {[...g.stakeholders.entries()].map(([sid, s]) => (
                    <li key={sid} className="px-3 py-2">
                      <Link href={`/projects/${id}/stakeholders/${sid}#documentatie`} className="link text-sm font-semibold">
                        {s.name}
                      </Link>
                      <ul className="mt-1 space-y-1 text-sm">
                        {s.links.map(({ link }) => (
                          <li key={link.id}>
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1.5">
                              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                              {link.title}
                            </a>
                          </li>
                        ))}
                        {s.files.map(({ file }) => (
                          <li key={file.id}>
                            <a href={`/files/${file.id}`} className="link inline-flex items-center gap-1.5">
                              <FileIcon className="h-3.5 w-3.5 shrink-0" />
                              {file.filename} <span className="text-xs text-slate-500">({formatBytes(file.size)})</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
