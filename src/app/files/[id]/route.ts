import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { blobs, docFiles } from "@/db/schema";
import { requireUser } from "@/lib/session";

/** Download a documentation file. Any active user (viewer and up) may download. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser("viewer");
  } catch {
    return new Response("Geen toegang", { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Niet gevonden", { status: 404 });

  const [row] = await db
    .select({ file: docFiles, data: blobs.data })
    .from(docFiles)
    .innerJoin(blobs, eq(blobs.id, docFiles.blobId))
    .where(and(eq(docFiles.id, id), isNull(docFiles.deletedAt)));
  if (!row) return new Response("Niet gevonden", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.file.mimeType,
      "Content-Length": String(row.data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
