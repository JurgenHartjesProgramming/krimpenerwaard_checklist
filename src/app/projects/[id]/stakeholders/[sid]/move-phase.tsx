"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignStakeholder } from "@/actions/checklist";
import type { StakeholderRole } from "@/db/schema";

/** Link a stakeholder to (another) activity with a role. Keyboard-friendly alternative to drag & drop. */
export function MoveToActivity({
  stakeholderId,
  currentActivityId,
  currentRole,
  options,
}: {
  stakeholderId: string;
  currentActivityId: string | null;
  currentRole: StakeholderRole;
  options: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState(currentActivityId ?? "");
  const [role, setRole] = useState<StakeholderRole>(currentRole);
  const [pending, startTransition] = useTransition();
  const unchanged = target === (currentActivityId ?? "") && role === currentRole;

  if (options.length === 0) {
    return <p className="text-sm text-slate-500">Dit project heeft nog geen activiteiten.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`move-${stakeholderId}`} className="text-sm text-slate-600">
        Activiteit:
      </label>
      <select
        id={`move-${stakeholderId}`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="input w-auto max-w-md py-1"
      >
        {!currentActivityId && (
          <option value="" disabled>
            Kies een activiteit…
          </option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Rol"
        value={role}
        onChange={(e) => setRole(e.target.value as StakeholderRole)}
        className="input w-auto py-1"
      >
        <option value="lead">Leidend</option>
        <option value="involved">Ook betrokken</option>
      </select>
      <button
        type="button"
        className="btn-secondary py-1"
        disabled={pending || !target || unchanged}
        onClick={() =>
          startTransition(async () => {
            const r = await assignStakeholder(stakeholderId, target, role);
            if (!r.ok) window.alert(r.error);
            router.refresh();
          })
        }
      >
        {currentActivityId ? "Wijzigen" : "Koppelen"}
      </button>
    </div>
  );
}
