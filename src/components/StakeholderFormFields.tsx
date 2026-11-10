"use client";

import { useId } from "react";
import type { Stakeholder } from "@/db/schema";

/**
 * Shared inputs for creating and editing a stakeholder (grid with 2 columns).
 * "Belangen en eisen" is no longer shown in the app; withInterests = true brings the field back.
 */
export function StakeholderFormFields({
  stakeholder,
  withInterests = false,
}: {
  stakeholder?: Stakeholder;
  withInterests?: boolean;
}) {
  // Unique per instance: a page can render several stakeholder forms.
  const p = useId();
  return (
    <>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}name`}>
          Naam / organisatie *
        </label>
        <input id={`${p}name`} name="name" required defaultValue={stakeholder?.name} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}contact`}>
          Contactpersoon
        </label>
        <input id={`${p}contact`} name="contactPerson" defaultValue={stakeholder?.contactPerson} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}deadline`}>
          Deadline
        </label>
        <input
          id={`${p}deadline`}
          name="deadline"
          type="date"
          defaultValue={stakeholder?.deadline ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${p}email`}>
          E-mail
        </label>
        <input id={`${p}email`} name="email" type="email" defaultValue={stakeholder?.email} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}phone`}>
          Telefoon
        </label>
        <input id={`${p}phone`} name="phone" type="tel" defaultValue={stakeholder?.phone} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}description`}>
          Omschrijving
        </label>
        <textarea
          id={`${p}description`}
          name="description"
          rows={2}
          defaultValue={stakeholder?.description}
          className="input"
        />
      </div>
      {withInterests && (
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}interests`}>
          Belangen en eisen
        </label>
        <textarea
          id={`${p}interests`}
          name="interests"
          rows={3}
          defaultValue={stakeholder?.interests}
          placeholder="Wat wil deze stakeholder bereiken, wat is belangrijk en welke eisen worden gesteld?"
          className="input"
        />
      </div>
      )}
    </>
  );
}
