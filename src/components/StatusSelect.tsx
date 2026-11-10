"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setStakeholderStatus } from "@/actions/checklist";
import type { StakeholderStatus } from "@/db/schema";
import { STAKEHOLDER_STATUS_COLORS, STAKEHOLDER_STATUS_LABELS } from "@/lib/labels";

interface Props {
  stakeholderId: string;
  version: number;
  status: StakeholderStatus;
  disabled?: boolean;
  /** Show a warning when an earlier phase is still open (phases are not locked). */
  earlierPhaseIncomplete: boolean;
}

export function StatusSelect({ stakeholderId, version, status, disabled, earlierPhaseIncomplete }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return <span className={`badge ${STAKEHOLDER_STATUS_COLORS[status]}`}>{STAKEHOLDER_STATUS_LABELS[status]}</span>;
  }

  return (
    <select
      aria-label="Status"
      value={status}
      disabled={pending}
      className={`rounded-full border-0 py-0.5 pr-7 pl-2 text-xs font-medium ${STAKEHOLDER_STATUS_COLORS[status]}`}
      onChange={(e) => {
        const next = e.target.value as StakeholderStatus;
        if (
          earlierPhaseIncomplete &&
          !window.confirm("Let op: een eerdere fase is nog niet afgerond. Wil je de status toch wijzigen?")
        ) {
          e.target.value = status;
          return;
        }
        const fd = new FormData();
        fd.set("id", stakeholderId);
        fd.set("version", String(version));
        fd.set("status", next);
        startTransition(async () => {
          const result = await setStakeholderStatus(fd);
          if (!result.ok) window.alert(result.error);
          router.refresh();
        });
      }}
    >
      {(Object.keys(STAKEHOLDER_STATUS_LABELS) as StakeholderStatus[]).map((s) => (
        <option key={s} value={s}>
          {STAKEHOLDER_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
