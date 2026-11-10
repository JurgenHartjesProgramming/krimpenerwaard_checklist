import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, type User, type UserRole } from "@/db/schema";

const RANK: Record<UserRole, number> = { viewer: 1, editor: 2, admin: 3 };

/**
 * The signed-in user, read fresh from the database on every request so that role
 * changes and deactivations take effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
});

export function hasRole(user: User | null, min: UserRole): boolean {
  return !!user && user.status === "active" && !!user.role && RANK[user.role] >= RANK[min];
}

/** For pages: redirect to login / pending screen when access is missing. */
export async function requirePageUser(min: UserRole = "viewer"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "active" || !user.role) redirect("/pending");
  if (!hasRole(user, min)) redirect("/");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "Je hebt geen rechten voor deze actie.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function requireUser(min: UserRole = "viewer"): Promise<User> {
  const user = await getCurrentUser();
  if (!hasRole(user, min)) throw new ForbiddenError();
  return user!;
}
