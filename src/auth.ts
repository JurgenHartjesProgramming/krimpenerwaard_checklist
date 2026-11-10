import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAudit, users } from "@/db/schema";
import { DEV_TENANT_ID, DEV_USERS } from "@/lib/dev-users";
import { isDevLoginEnabled, isEntraConfigured } from "@/lib/env";

export const DEV_LOGIN_PROVIDER = "dev-login";

/** Tenants allowed to sign in, from ALLOWED_TENANT_IDS (comma separated). */
function allowedTenants(): Set<string> {
  return new Set(
    (process.env.ALLOWED_TENANT_IDS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

interface EntraProfile {
  tid?: string;
  oid?: string;
  sub?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
}

/** Create or refresh the local user for an Entra sign-in; returns the local user id. */
async function upsertEntraUser(p: EntraProfile): Promise<string> {
  const tenantId = p.tid!.toLowerCase();
  const oid = p.oid ?? p.sub!;
  const email = (p.email ?? p.preferred_username ?? "").toLowerCase();
  const name = p.name ?? email;

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.oid, oid)));
  if (existing) {
    await db.update(users).set({ email, name, lastLoginAt: new Date() }).where(eq(users.id, existing.id));
    return existing.id;
  }

  const initialAdmin = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const isInitialAdmin = initialAdmin !== "" && initialAdmin === email;
  const [created] = await db
    .insert(users)
    .values({
      tenantId,
      oid,
      email,
      name,
      role: isInitialAdmin ? "admin" : null,
      status: isInitialAdmin ? "active" : "pending",
      lastLoginAt: new Date(),
    })
    .returning();
  await db.insert(adminAudit).values({
    actorId: created.id,
    targetUserId: created.id,
    action: isInitialAdmin ? "initial_admin_created" : "user_registered",
    details: { email, tenantId },
  });
  return created.id;
}

/** Development login: find or create one of the fixed DEV_USERS. */
async function upsertDevUser(key: string) {
  const dev = DEV_USERS.find((u) => u.key === key);
  if (!dev) return null;
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, DEV_TENANT_ID), eq(users.oid, dev.key)));
  if (existing) {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({
      tenantId: DEV_TENANT_ID,
      oid: dev.key,
      email: dev.email,
      name: dev.name,
      role: dev.role,
      status: dev.status,
      lastLoginAt: new Date(),
    })
    .returning();
  await db.insert(adminAudit).values({
    actorId: created.id,
    targetUserId: created.id,
    action: "user_registered",
    details: { email: dev.email, tenantId: DEV_TENANT_ID },
  });
  return created;
}

const providers: Provider[] = [];

if (isEntraConfigured()) {
  providers.push(
    MicrosoftEntraID({
      // Multi-tenant (work/school accounts only). Tenant filtering happens in the signIn callback.
      issuer: "https://login.microsoftonline.com/organizations/v2.0",
      // Skip the default Graph photo fetch; we only need the id token claims.
      profile(profile) {
        return { id: profile.sub, name: profile.name, email: profile.email ?? profile.preferred_username };
      },
    }),
  );
}

// Never registered outside `next dev`: in a production build this provider does not exist.
if (isDevLoginEnabled()) {
  providers.push(
    Credentials({
      id: DEV_LOGIN_PROVIDER,
      name: "Ontwikkel-login",
      credentials: { userKey: { label: "Gebruiker" } },
      async authorize(credentials) {
        if (!isDevLoginEnabled()) return null;
        const user = await upsertDevUser(String(credentials?.userKey ?? ""));
        return user ? { id: user.id, name: user.name, email: user.email } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === DEV_LOGIN_PROVIDER) return isDevLoginEnabled();
      const tid = (profile as EntraProfile | undefined)?.tid?.toLowerCase();
      if (!tid || !allowedTenants().has(tid)) return "/login?error=tenant";
      return true;
    },
    async jwt({ token, account, profile, user }) {
      // `account` is only present right after sign-in.
      if (account?.provider === DEV_LOGIN_PROVIDER && user?.id) token.uid = user.id;
      else if (account && profile) token.uid = await upsertEntraUser(profile as EntraProfile);
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
