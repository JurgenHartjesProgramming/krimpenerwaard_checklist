"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setUserAccess } from "@/actions/admin";
import type { UserRole } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/labels";

type Status = "pending" | "active" | "deactivated";

export function UserAccessForm({
  userId,
  role,
  status,
  isSelf,
}: {
  userId: string;
  role: UserRole | null;
  status: Status;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState<UserRole | "">(role ?? "");
  const [nextStatus, setNextStatus] = useState<Status>(status);
  const [pending, startTransition] = useTransition();
  const dirty = nextRole !== (role ?? "") || nextStatus !== status;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Rol"
        value={nextRole}
        onChange={(e) => setNextRole(e.target.value as UserRole | "")}
        className="input w-auto py-1"
      >
        <option value="">Geen rol</option>
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <select
        aria-label="Status"
        value={nextStatus}
        onChange={(e) => setNextStatus(e.target.value as Status)}
        className="input w-auto py-1"
      >
        <option value="pending">In afwachting</option>
        <option value="active">Actief</option>
        <option value="deactivated">Gedeactiveerd</option>
      </select>
      <button
        type="button"
        className="btn-primary py-1"
        disabled={!dirty || pending}
        onClick={() => {
          if (isSelf && !window.confirm("Je wijzigt je eigen toegang. Doorgaan?")) return;
          startTransition(async () => {
            const r = await setUserAccess({ userId, role: nextRole || null, status: nextStatus });
            if (!r.ok) window.alert(r.error);
            router.refresh();
          });
        }}
      >
        Opslaan
      </button>
    </div>
  );
}
