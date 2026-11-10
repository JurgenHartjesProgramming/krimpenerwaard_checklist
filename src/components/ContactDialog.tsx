"use client";

import { useRef } from "react";
import { updateStakeholder } from "@/actions/checklist";
import { ActionForm } from "@/components/ActionForm";
import { PencilIcon } from "@/components/icons";
import { StakeholderFormFields } from "@/components/StakeholderFormFields";
import type { Stakeholder } from "@/db/schema";

/** Pencil button that opens a pop-up to edit a stakeholder's name and contact details. */
export function ContactDialog({ stakeholder: s, className = "btn-ghost p-1.5" }: { stakeholder: Stakeholder; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()} title="Contactgegevens bewerken">
        <PencilIcon />
        <span className="sr-only">Contactgegevens van {s.name} bewerken</span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`contact-title-${s.id}`}
        className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-sm p-0 text-left font-normal shadow-xl backdrop:bg-slate-900/50"
        onClick={(e) => {
          // Click on the backdrop closes the dialog.
          if (e.target === ref.current) close();
        }}
      >
        <div className="border-t-4 border-brand-700 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={`contact-title-${s.id}`} className="text-lg font-bold text-brand-900">
              Contactgegevens bewerken
            </h2>
            <button type="button" className="btn-ghost px-2 py-1" onClick={close} aria-label="Sluiten">
              ✕
            </button>
          </div>
          {/* key on version: fresh values after every save */}
          <ActionForm key={s.version} action={updateStakeholder} onSuccess={close} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="version" value={s.version} />
            <StakeholderFormFields stakeholder={s} withInterests={false} />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn-secondary" onClick={close}>
                Annuleren
              </button>
              <button className="btn-primary">Opslaan</button>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
