"use client";

import { useRouter } from "next/navigation";
import { createProject, updateProject } from "@/actions/projects";
import { ActionForm } from "@/components/ActionForm";
import type { ActionResult } from "@/lib/action";
import type { Project, ProjectStatus } from "@/db/schema";
import { PROJECT_STATUS_LABELS } from "@/lib/labels";

export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  return (
    <ActionForm
      action={(project ? updateProject : createProject) as (fd: FormData) => Promise<ActionResult<{ id?: string } | void>>}
      className="grid gap-4 sm:grid-cols-2"
      successMessage={project ? "Opgeslagen." : undefined}
      onSuccess={(data) => {
        if (!project && data?.id) router.push(`/projects/${data.id}`);
      }}
    >
      {project && (
        <>
          <input type="hidden" name="id" value={project.id} />
          <input type="hidden" name="version" value={project.version} />
        </>
      )}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">
          Naam *
        </label>
        <input id="name" name="name" required defaultValue={project?.name} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">
          Omschrijving
        </label>
        <textarea id="description" name="description" rows={3} defaultValue={project?.description} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="status">
          Status
        </label>
        <select id="status" name="status" defaultValue={project?.status ?? "active"} className="input">
          {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div />
      <div>
        <label className="label" htmlFor="startDate">
          Startdatum
        </label>
        <input id="startDate" name="startDate" type="date" defaultValue={project?.startDate ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="endDate">
          Einddatum
        </label>
        <input id="endDate" name="endDate" type="date" defaultValue={project?.endDate ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="leaderName">
          Projectleider
        </label>
        <input id="leaderName" name="leaderName" defaultValue={project?.leaderName} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="leaderEmail">
          E-mail projectleider
        </label>
        <input
          id="leaderEmail"
          name="leaderEmail"
          type="email"
          defaultValue={project?.leaderEmail}
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <button className="btn-primary">{project ? "Opslaan" : "Project aanmaken"}</button>
      </div>
    </ActionForm>
  );
}
