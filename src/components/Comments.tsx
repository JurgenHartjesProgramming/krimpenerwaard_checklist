"use client";

import { useState } from "react";
import { addComment, deleteComment, editComment } from "@/actions/content";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { Linkify } from "@/components/Linkify";
import { COMMENT_LABELS, commentLabel, formatDateTime, WARNING_LABEL } from "@/lib/labels";

export interface CommentItem {
  id: string;
  body: string;
  labels: string[];
  authorId: string;
  authorName: string;
  createdAt: Date;
  editedAt: Date | null;
  version: number;
}

interface Props {
  comments: CommentItem[];
  target: { phaseId: string } | { activityId: string } | { stakeholderId: string };
  currentUserId: string;
  canWrite: boolean;
  isAdmin: boolean;
}

/** Coloured label chips shown on a comment. */
export function LabelBadges({ labels }: { labels: string[] }) {
  const known = labels.map(commentLabel).filter((l) => !!l);
  if (known.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {known.map((l) => (
        <span key={l.key} className={`badge ring-1 ${l.className}`}>
          {l.key === WARNING_LABEL && <span aria-hidden>⚠&nbsp;</span>}
          {l.label}
        </span>
      ))}
    </span>
  );
}

/** Toggle chips for choosing labels; submitted as repeated "labels" form fields. */
function LabelPicker({ defaultValue = [] }: { defaultValue?: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="sr-only">Labels</legend>
      <span className="mr-1 text-xs font-semibold text-slate-600">Labels:</span>
      {COMMENT_LABELS.map((l) => {
        const on = selected.includes(l.key);
        return (
          <label
            key={l.key}
            className={`badge cursor-pointer ring-1 select-none ${on ? l.className : "bg-white text-slate-500 ring-slate-300 hover:bg-slate-50"}`}
          >
            <input
              type="checkbox"
              name="labels"
              value={l.key}
              checked={on}
              onChange={(e) => setSelected(e.target.checked ? [...selected, l.key] : selected.filter((k) => k !== l.key))}
              className="sr-only"
            />
            {on ? "✓ " : ""}
            {l.label}
          </label>
        );
      })}
    </fieldset>
  );
}

export function Comments({ comments, target, currentUserId, canWrite, isAdmin }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const usedLabels = COMMENT_LABELS.filter((l) => comments.some((c) => c.labels.includes(l.key)));
  const visible = filter ? comments.filter((c) => c.labels.includes(filter)) : comments;

  return (
    <div className="space-y-3">
      {comments.length === 0 && <p className="text-sm text-slate-500">Nog geen comments.</p>}
      {usedLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-600">Filter:</span>
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={`badge ring-1 ${filter === null ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-600 ring-slate-300"}`}
          >
            Alle ({comments.length})
          </button>
          {usedLabels.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setFilter(filter === l.key ? null : l.key)}
              aria-pressed={filter === l.key}
              className={`badge ring-1 ${filter === l.key ? l.className : "bg-white text-slate-600 ring-slate-300"}`}
            >
              {l.label} ({comments.filter((c) => c.labels.includes(l.key)).length})
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {visible.map((c) => (
          <CommentRow key={c.id} comment={c} canEdit={canWrite && (c.authorId === currentUserId || isAdmin)} />
        ))}
      </ul>
      {canWrite && (
        <ActionForm action={addComment} resetOnSuccess className="space-y-2">
          {"phaseId" in target && <input type="hidden" name="phaseId" value={target.phaseId} />}
          {"activityId" in target && <input type="hidden" name="activityId" value={target.activityId} />}
          {"stakeholderId" in target && <input type="hidden" name="stakeholderId" value={target.stakeholderId} />}
          <textarea name="body" required rows={2} className="input" placeholder="Schrijf een comment…" aria-label="Comment" />
          {/* key resets the picker after a successful post (form reset does not touch React state) */}
          <LabelPicker key={comments.length} />
          <button className="btn-primary">Plaatsen</button>
        </ActionForm>
      )}
    </div>
  );
}

function CommentRow({ comment, canEdit }: { comment: CommentItem; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const warning = comment.labels.includes(WARNING_LABEL);
  return (
    <li
      className={`rounded-sm border px-3 py-2 ${warning ? "border-red-200 border-l-4 border-l-red-500 bg-red-50/60" : "border-slate-200 bg-slate-50"}`}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="flex flex-wrap items-center gap-2">
          <span>
            <span className="font-medium text-slate-700">{comment.authorName}</span> · {formatDateTime(comment.createdAt)}
            {comment.editedAt && <span title={formatDateTime(comment.editedAt)}> · bewerkt</span>}
          </span>
          {!editing && <LabelBadges labels={comment.labels} />}
        </span>
        {canEdit && !editing && (
          <span className="flex gap-1">
            <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => setEditing(true)}>
              Bewerken
            </button>
            <ActionButton
              className="btn-ghost px-1.5 py-0.5 text-xs text-red-700"
              confirm="Comment verwijderen? Een admin kan dit terugzetten."
              run={() => deleteComment(comment.id, comment.version)}
            >
              Verwijderen
            </ActionButton>
          </span>
        )}
      </div>
      {editing ? (
        <ActionForm action={editComment} onSuccess={() => setEditing(false)} className="space-y-2">
          <input type="hidden" name="id" value={comment.id} />
          <input type="hidden" name="version" value={comment.version} />
          <textarea name="body" defaultValue={comment.body} required rows={3} className="input" aria-label="Comment" />
          <LabelPicker defaultValue={comment.labels} />
          <div className="flex gap-2">
            <button className="btn-primary">Opslaan</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              Annuleren
            </button>
          </div>
        </ActionForm>
      ) : (
        <p className="text-sm">
          <Linkify text={comment.body} />
        </p>
      )}
    </li>
  );
}
