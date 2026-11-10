import { ZodError } from "zod";
import { ConflictError, NotFoundError } from "@/lib/history";
import { ForbiddenError } from "@/lib/session";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Errors whose message is meant for the end user. */
export class UserError extends Error {}

/**
 * Wrap a server action body: known errors become `{ ok: false, error }` with a Dutch
 * message for the UI; anything unexpected is logged and reported generically.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (
      err instanceof ConflictError ||
      err instanceof NotFoundError ||
      err instanceof ForbiddenError ||
      err instanceof UserError
    ) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues.map((i) => i.message).join(" ") };
    }
    // Let Next.js redirects / notFound propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(err);
    return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
  }
}
