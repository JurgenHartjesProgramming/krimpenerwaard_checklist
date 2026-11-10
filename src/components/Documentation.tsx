"use client";

import { useState } from "react";
import { addDocLink, deleteDocFile, deleteDocLink, updateDocLink, uploadDocFile } from "@/actions/content";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { FileIcon, LinkIcon, PencilIcon, TrashIcon } from "@/components/icons";
import type { DocFile, DocLink } from "@/db/schema";
import { ALLOWED_EXTENSIONS, formatBytes } from "@/lib/files";

/** Where new documentation goes: a stakeholder, or the project itself (general documents). */
export type DocTarget = { stakeholderId: string } | { projectId: string };

export function Documentation({
  target,
  links,
  files,
  canWrite,
}: {
  target: DocTarget;
  links: DocLink[];
  files: DocFile[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<"link" | "file">("link");

  return (
    <div className="space-y-4">
      {links.length === 0 && files.length === 0 && (
        <p className="text-sm text-slate-500">{"stakeholderId" in target ? "Nog geen documentatie bij deze stakeholder." : "Nog geen projectdocumenten."}</p>
      )}

      {links.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Links</h4>
          <ul className="divide-y divide-slate-100 rounded-sm border border-slate-200">
            {links.map((l) => (
              <LinkRow key={l.id} link={l} canWrite={canWrite} />
            ))}
          </ul>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Bestanden</h4>
          <ul className="divide-y divide-slate-100 rounded-sm border border-slate-200">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <a href={`/files/${f.id}`} className="link flex min-w-0 items-center gap-2">
                  <FileIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{f.filename}</span>
                  <span className="shrink-0 text-xs text-slate-500">({formatBytes(f.size)})</span>
                </a>
                {canWrite && (
                  <ActionButton
                    className="btn-ghost p-1.5 text-slate-500 hover:text-red-700"
                    confirm={`Document "${f.filename}" verwijderen? Een admin kan dit terugzetten.`}
                    run={() => deleteDocFile(f.id, f.version)}
                  >
                    <TrashIcon />
                    <span className="sr-only">Verwijder {f.filename}</span>
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canWrite && (
        <div className="rounded-sm border border-brand-100 bg-brand-50/60 p-3">
          <div role="tablist" aria-label="Documentatie toevoegen" className="mb-3 flex gap-1">
            {(
              [
                ["link", "Link toevoegen"],
                ["file", "Bestand uploaden"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-sm px-3 py-1.5 text-sm font-semibold ${
                  tab === key ? "bg-brand-700 text-white" : "text-brand-800 hover:bg-brand-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "link" ? (
            <ActionForm action={addDocLink} resetOnSuccess className="space-y-2" successMessage="Link toegevoegd.">
              {"stakeholderId" in target ? (
                <input type="hidden" name="stakeholderId" value={target.stakeholderId} />
              ) : (
                <input type="hidden" name="projectId" value={target.projectId} />
              )}
              <input name="title" required placeholder="Titel, bijv. Vergunningaanvraag" aria-label="Titel" className="input" />
              <input name="url" required type="url" placeholder="https://…" aria-label="URL" className="input" />
              <input name="description" placeholder="Omschrijving (optioneel)" aria-label="Omschrijving" className="input" />
              <button className="btn-primary">Link toevoegen</button>
            </ActionForm>
          ) : (
            <ActionForm action={uploadDocFile} resetOnSuccess className="space-y-2" successMessage="Bestand geüpload.">
              {"stakeholderId" in target ? (
                <input type="hidden" name="stakeholderId" value={target.stakeholderId} />
              ) : (
                <input type="hidden" name="projectId" value={target.projectId} />
              )}
              <input
                name="file"
                type="file"
                required
                aria-label="Bestand"
                accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
                className="block w-full text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:font-semibold file:text-white"
              />
              <p className="text-xs text-slate-500">Max. 25 MB · {ALLOWED_EXTENSIONS.join(", ")}</p>
              <button className="btn-primary">Uploaden</button>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}

function LinkRow({ link: l, canWrite }: { link: DocLink; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="px-3 py-2">
        <ActionForm action={updateDocLink} onSuccess={() => setEditing(false)} className="space-y-2">
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="version" value={l.version} />
          <input name="title" required defaultValue={l.title} aria-label="Titel" className="input" />
          <input name="url" required type="url" defaultValue={l.url} aria-label="URL" className="input" />
          <input name="description" defaultValue={l.description} aria-label="Omschrijving" placeholder="Omschrijving" className="input" />
          <div className="flex gap-2">
            <button className="btn-primary">Opslaan</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              Annuleren
            </button>
          </div>
        </ActionForm>
      </li>
    );
  }
  return (
    <li className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="link flex items-center gap-2 font-semibold">
          <LinkIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{l.title}</span>
        </a>
        <p className="truncate pl-6 text-xs text-slate-500">{l.description || l.url}</p>
      </div>
      {canWrite && (
        <div className="flex shrink-0">
          <button type="button" className="btn-ghost p-1.5" onClick={() => setEditing(true)} title="Link bewerken">
            <PencilIcon />
            <span className="sr-only">Bewerk {l.title}</span>
          </button>
          <ActionButton
            className="btn-ghost p-1.5 text-slate-500 hover:text-red-700"
            confirm={`Link "${l.title}" verwijderen? Een admin kan dit terugzetten.`}
            run={() => deleteDocLink(l.id, l.version)}
          >
            <TrashIcon />
            <span className="sr-only">Verwijder {l.title}</span>
          </ActionButton>
        </div>
      )}
    </li>
  );
}
