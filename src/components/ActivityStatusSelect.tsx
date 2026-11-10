"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActivityStatus } from "@/actions/checklist";
import type { ActivityStatus } from "@/db/schema";
import { ACTIVITY_STATUS_COLORS, ACTIVITY_STATUS_LABELS } from "@/lib/labels";

export function ActivityStatusSelect({
  activityId,
  version,
  status,
  disabled,
  earlierPhaseIncomplete,
}: {
  activityId: string;
  version: number;
  status: ActivityStatus;
  disabled?: boolean;
  /** Warn (not block) when an earlier phase is still open. */
  earlierPhaseIncomplete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return <span className={`badge ${ACTIVITY_STATUS_COLORS[status]}`}>{ACTIVITY_STATUS_LABELS[status]}</span>;
  }
  return (
    <select
      aria-label="Status activiteit"
      value={status}
      disabled={pending}
      className={`rounded-full border-0 py-0.5 pr-7 pl-2 text-xs font-semibold ${ACTIVITY_STATUS_COLORS[status]}`}
      onChange={(e) => {
        const next = e.target.value as ActivityStatus;
        if (
          earlierPhaseIncomplete &&
          !window.confirm("Let op: een eerdere fase is nog niet afgerond. Wil je de status toch wijzigen?")
        ) {
          e.target.value = status;
          return;
        }
        const fd = new FormData();
        fd.set("id", activityId);
        fd.set("version", String(version));
        fd.set("status", next);
        startTransition(async () => {
          const r = await setActivityStatus(fd);
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
    >
      {(Object.keys(ACTIVITY_STATUS_LABELS) as ActivityStatus[]).map((s) => (
        <option key={s} value={s}>
          {ACTIVITY_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
