"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activities, blobs, comments, docFiles, docLinks, phases, projects, stakeholders, type Comment } from "@/db/schema";
import { runAction, UserError } from "@/lib/action";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES, mimeFor } from "@/lib/files";
import { COMMENT_LABELS } from "@/lib/labels";
import { createEntity, deleteEntity, newBatch, updateEntity } from "@/lib/history";
import { assertProjectWritable } from "@/lib/queries";
import { hasRole, requireUser } from "@/lib/session";
import { formObject, id, optionalText, requiredText, version } from "./forms";

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
}

async function stakeholderOrThrow(stakeholderId: string) {
  const [s] = await db.select().from(stakeholders).where(eq(stakeholders.id, id.parse(stakeholderId)));
  if (!s || s.deletedAt) throw new UserError("Stakeholder niet gevonden.");
  return s;
}

/**
 * Where a document belongs: a stakeholder (form field "stakeholderId") or, for general
 * project documents, the project itself (form field "projectId").
 */
async function docTarget(raw: { stakeholderId?: unknown; projectId?: unknown }) {
  if (raw.stakeholderId) {
    const s = await stakeholderOrThrow(String(raw.stakeholderId));
    return { projectId: s.projectId, stakeholderId: s.id as string | null };
  }
  const [p] = await db.select().from(projects).where(eq(projects.id, id.parse(String(raw.projectId ?? ""))));
  if (!p || p.deletedAt) throw new UserError("Project niet gevonden.");
  return { projectId: p.id, stakeholderId: null };
}

// ---------------------------------------------------------------------------
// Documentation links
// ---------------------------------------------------------------------------

const linkFields = z.object({
  title: requiredText("Titel", 200),
  url: z
    .string()
    .trim()
    .refine((v) => /^https?:\/\//i.test(v) && z.url().safeParse(v).success, "Ongeldige URL (begin met https://)."),
  description: optionalText(1000),
});

export async function addDocLink(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const target = await docTarget(raw);
    const values = linkFields.parse(raw);
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, target.projectId);
      await createEntity(
        tx,
        newBatch(user.id, target.stakeholderId ? "Documentatielink toegevoegd" : "Projectdocument (link) toegevoegd"),
        "doc_link",
        { ...values, ...target, createdBy: user.id },
      );
    });
    revalidateProject(target.projectId);
  });
}

export async function deleteDocLink(linkId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const [link] = await db.select().from(docLinks).where(eq(docLinks.id, id.parse(linkId)));
    if (!link) throw new UserError("Link niet gevonden.");
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, link.projectId);
      await deleteEntity(tx, newBatch(user.id, `Link "${link.title}" verwijderd`), "doc_link", link.id, expectedVersion);
    });
    revalidateProject(link.projectId);
  });
}

// ---------------------------------------------------------------------------
// Documentation files
// ---------------------------------------------------------------------------

export async function uploadDocFile(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const target = await docTarget({ stakeholderId: fd.get("stakeholderId"), projectId: fd.get("projectId") });
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Kies een bestand.");
    if (file.size > MAX_FILE_BYTES) throw new UserError("Bestand is groter dan 25 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new UserError(`Bestandstype .${ext} is niet toegestaan.`);
    }
    const data = Buffer.from(await file.arrayBuffer());
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, target.projectId);
      const [blob] = await tx.insert(blobs).values({ data, size: data.length }).returning({ id: blobs.id });
      await createEntity(tx, newBatch(user.id, target.stakeholderId ? "Document geüpload" : "Projectdocument geüpload"), "doc_file", {
        ...target,
        blobId: blob.id,
        filename: file.name,
        mimeType: mimeFor(ext),
        size: data.length,
        createdBy: user.id,
      });
    });
    revalidateProject(target.projectId);
  });
}

export async function deleteDocFile(fileId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const [file] = await db.select().from(docFiles).where(eq(docFiles.id, id.parse(fileId)));
    if (!file) throw new UserError("Document niet gevonden.");
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, file.projectId);
      await deleteEntity(tx, newBatch(user.id, `Document "${file.filename}" verwijderd`), "doc_file", file.id, expectedVersion);
    });
    revalidateProject(file.projectId);
  });
}

// ---------------------------------------------------------------------------
// Comments (on a phase or on a stakeholder)
// ---------------------------------------------------------------------------

const commentBody = requiredText("Comment", 10_000);

/** Selected label checkboxes (name="labels"), limited to the known labels. */
function commentLabels(fd: FormData): string[] {
  const known = new Set<string>(COMMENT_LABELS.map((l) => l.key));
  return [...new Set(fd.getAll("labels").map(String))].filter((k) => known.has(k));
}

export async function addComment(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const body = commentBody.parse(raw.body);
    const labels = commentLabels(fd);
    let target: { projectId: string; phaseId: string | null; activityId: string | null; stakeholderId: string | null };
    if (raw.stakeholderId) {
      const s = await stakeholderOrThrow(raw.stakeholderId);
      target = { projectId: s.projectId, phaseId: null, activityId: null, stakeholderId: s.id };
    } else if (raw.activityId) {
      const [a] = await db.select().from(activities).where(eq(activities.id, id.parse(raw.activityId)));
      if (!a || a.deletedAt) throw new UserError("Activiteit niet gevonden.");
      target = { projectId: a.projectId, phaseId: null, activityId: a.id, stakeholderId: null };
    } else {
      const [p] = await db.select().from(phases).where(eq(phases.id, id.parse(raw.phaseId)));
      if (!p || p.deletedAt) throw new UserError("Fase niet gevonden.");
      target = { projectId: p.projectId, phaseId: p.id, activityId: null, stakeholderId: null };
    }
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, target.projectId);
      await createEntity(tx, newBatch(user.id, "Comment geplaatst"), "comment", { ...target, body, labels, authorId: user.id });
    });
    revalidateProject(target.projectId);
  });
}

async function editableComment(commentId: string, userId: string, isAdmin: boolean): Promise<Comment> {
  const [c] = await db.select().from(comments).where(eq(comments.id, id.parse(commentId)));
  if (!c || c.deletedAt) throw new UserError("Comment niet gevonden.");
  if (c.authorId !== userId && !isAdmin) throw new UserError("Je kunt alleen je eigen comments wijzigen.");
  return c;
}

export async function editComment(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const c = await editableComment(raw.id, user.id, hasRole(user, "admin"));
    const body = commentBody.parse(raw.body);
    const labels = commentLabels(fd);
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, c.projectId);
      await updateEntity(tx, newBatch(user.id, "Comment bewerkt"), "comment", c.id, version.parse(raw.version), {
        body,
        labels,
        editedAt: new Date(),
      });
    });
    revalidateProject(c.projectId);
  });
}

export async function deleteComment(commentId: string, expectedVersion: number) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const c = await editableComment(commentId, user.id, hasRole(user, "admin"));
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, c.projectId);
      await deleteEntity(tx, newBatch(user.id, "Comment verwijderd"), "comment", c.id, expectedVersion);
    });
    revalidateProject(c.projectId);
  });
}

export async function updateDocLink(fd: FormData) {
  return runAction(async () => {
    const user = await requireUser("editor");
    const raw = formObject(fd);
    const [link] = await db.select().from(docLinks).where(eq(docLinks.id, id.parse(raw.id)));
    if (!link || link.deletedAt) throw new UserError("Link niet gevonden.");
    const values = linkFields.parse(raw);
    await db.transaction(async (tx) => {
      await assertProjectWritable(tx, link.projectId);
      await updateEntity(tx, newBatch(user.id), "doc_link", link.id, version.parse(raw.version), values);
    });
    revalidateProject(link.projectId);
  });
}
