"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { projectStatus, type Project } from "@/db/schema";
import { runAction } from "@/lib/action";
import { createEntity, deleteEntity, newBatch, updateEntity } from "@/lib/history";
import { requireUser } from "@/lib/session";
import { formObject, id, optionalDate, optionalEmail, optionalText, requiredText, version } from "./forms";

const projectFields = z.object({
  name: requiredText("Naam", 200),
  description: optionalText(),
  status: z.enum(projectStatus.enumValues).default("active"),
  startDate: optionalDate,
  endDate: optionalDate,
  leaderName: optionalText(200),
  leaderEmail: optionalEmail,
});

export async function createProject(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("admin");
    const values = projectFields.parse(formObject(fd));
    const project = await db.transaction((tx) =>
      createEntity<Project>(tx, newBatch(user.id, "Project aangemaakt"), "project", values),
    );
    revalidatePath("/");
    return { id: project.id };
  });
}

export async function updateProject(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("admin");
    const raw = formObject(fd);
    const values = projectFields.parse(raw);
    const projectId = id.parse(raw.id);
    await db.transaction((tx) =>
      updateEntity(tx, newBatch(user.id), "project", projectId, version.parse(raw.version), values),
    );
    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`);
  });
}

export async function deleteProject(projectId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("admin");
    await db.transaction((tx) =>
      deleteEntity(tx, newBatch(user.id, "Project verwijderd"), "project", id.parse(projectId), expectedVersion),
    );
    revalidatePath("/");
  });
}
