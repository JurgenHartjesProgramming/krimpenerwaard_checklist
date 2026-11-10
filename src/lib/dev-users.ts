import type { UserRole } from "@/db/schema";

/**
 * Fixed test users for the development-only login (see src/auth.ts).
 * They live in a pseudo tenant that can never match a real Entra tenant id (not a GUID).
 * Their role is only set when they are first created; afterwards the admin screen applies.
 */
export const DEV_TENANT_ID = "dev-login";

export const DEV_USERS: {
  key: string;
  name: string;
  email: string;
  role: UserRole | null;
  status: "active" | "pending";
  description: string;
}[] = [
  { key: "admin", name: "Dev Admin", email: "admin@dev.local", role: "admin", status: "active", description: "Alle rechten" },
  { key: "editor", name: "Dev Bewerker", email: "bewerker@dev.local", role: "editor", status: "active", description: "Checklist bewerken" },
  { key: "viewer", name: "Dev Lezer", email: "lezer@dev.local", role: "viewer", status: "active", description: "Alleen lezen" },
  { key: "pending", name: "Dev Nieuwe gebruiker", email: "nieuw@dev.local", role: null, status: "pending", description: "Nog niet goedgekeurd" },
];
