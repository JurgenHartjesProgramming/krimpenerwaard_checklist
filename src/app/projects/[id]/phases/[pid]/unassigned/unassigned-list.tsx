"use client";

import { Fragment, useState } from "react";
import { MoveToActivity } from "../../../stakeholders/[sid]/move-phase";
import { StakeholderDetailRow, StakeholderTableRow, StakeholderTableShell, type StakeholderRow } from "@/components/StakeholderTable";

export function UnassignedList({
  projectId,
  stakeholders,
  options,
  canWrite,
}: {
  projectId: string;
  stakeholders: StakeholderRow[];
  options: { id: string; label: string }[];
  canWrite: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="card overflow-hidden">
      <StakeholderTableShell canWrite={canWrite} extraHeader={canWrite ? "Koppelen aan activiteit" : undefined}>
        {stakeholders.map((s) => (
          <Fragment key={s.id}>
            <StakeholderTableRow
              s={s}
              projectId={projectId}
              canWrite={canWrite}
              earlierPhaseIncomplete={false}
              isOpen={expanded.has(s.id)}
              onToggle={() => toggle(s.id)}
              extraCell={
                canWrite ? (
                  <MoveToActivity stakeholderId={s.id} currentActivityId={null} currentRole={s.role} options={options} />
                ) : undefined
              }
            />
            {expanded.has(s.id) && (
              <StakeholderDetailRow s={s} projectId={projectId} canWrite={canWrite} colSpan={canWrite ? 8 : 5} />
            )}
          </Fragment>
        ))}
      </StakeholderTableShell>
    </div>
  );
}
