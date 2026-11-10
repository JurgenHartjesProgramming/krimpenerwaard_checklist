"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreProject, revertHistoryEvent } from "@/actions/admin";
import { ActionButton } from "@/components/ActionForm";
import { formatDateTime } from "@/lib/labels";

export function RevertButton({ eventId }: { eventId: number }) {
  return (
    <ActionButton
      className="btn-ghost px-2 py-0.5 text-xs"
      confirm={`Wijziging #${eventId} terugdraaien? Alleen de velden die deze wijziging aanpaste worden teruggezet.`}
      run={() => revertHistoryEvent(eventId)}
    >
      Terugdraaien
    </ActionButton>
  );
}

/** Restore the whole project to the state right after this change. */
export function RestoreToMomentButton({ projectId, at }: { projectId: string; at: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-ghost px-2 py-0.5 text-xs"
      onClick={() => {
        if (!window.confirm(`Het hele project terugzetten naar de stand van ${formatDateTime(at)}?`)) return;
        startTransition(async () => {
          const r = await restoreProject(projectId, at);
          window.alert(r.ok ? `Teruggezet: ${r.data?.changed ?? 0} onderdelen aangepast.` : r.error);
          router.refresh();
        });
      }}
    >
      Project naar dit moment
    </button>
  );
}

export function RestoreForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value) return;
        // datetime-local is in the browser's time zone; convert to an absolute ISO timestamp.
        const at = new Date(value).toISOString();
        if (!window.confirm(`Het hele project terugzetten naar ${formatDateTime(at)}?`)) return;
        startTransition(async () => {
          const r = await restoreProject(projectId, at);
          setMessage(r.ok ? `Teruggezet: ${r.data?.changed ?? 0} onderdelen aangepast.` : r.error);
          router.refresh();
        });
      }}
    >
      <input
        type="datetime-local"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input w-auto"
      />
      <button className="btn-primary" disabled={pending}>
        Terugzetten
      </button>
      {message && <span className="text-sm text-slate-700">{message}</span>}
    </form>
  );
}
