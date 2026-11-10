"use client";

import { useId } from "react";
import type { Activity } from "@/db/schema";

/** Shared inputs for creating and editing an activity (grid with 2 columns). */
export function ActivityFormFields({ activity }: { activity?: Activity }) {
  const p = useId();
  return (
    <>
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[6rem_1fr]">
        <div>
          <label className="label" htmlFor={`${p}number`}>
            Nr.
          </label>
          <input id={`${p}number`} name="number" defaultValue={activity?.number} placeholder="1.1" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`${p}name`}>
            Activiteit *
          </label>
          <input id={`${p}name`} name="name" required defaultValue={activity?.name} className="input" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}description`}>
          Beschrijving
        </label>
        <textarea
          id={`${p}description`}
          name="description"
          rows={3}
          defaultValue={activity?.description}
          placeholder="Wat doe of controleer je in deze activiteit?"
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}result`}>
          Resultaat
        </label>
        <input id={`${p}result`} name="result" defaultValue={activity?.result} placeholder="Bijv. Startnotitie met ambities" className="input" />
      </div>
    </>
  );
}
