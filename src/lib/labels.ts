import type { ActivityStatus, ProjectStatus, StakeholderRole, StakeholderStatus, UserRole } from "@/db/schema";

export const STAKEHOLDER_STATUS_LABELS: Record<StakeholderStatus, string> = {
  not_started: "Nog niet gestart",
  contacted: "Gecontacteerd",
  awaiting_response: "Wacht op reactie",
  done: "Afgerond",
  not_applicable: "Niet van toepassing",
};

export const STAKEHOLDER_STATUS_COLORS: Record<StakeholderStatus, string> = {
  not_started: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-100 text-blue-800",
  awaiting_response: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  not_applicable: "bg-slate-200 text-slate-500",
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: "Nog niet gestart",
  in_progress: "Bezig",
  done: "Afgerond",
  not_applicable: "Niet van toepassing",
};

export const ACTIVITY_STATUS_COLORS: Record<ActivityStatus, string> = {
  not_started: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  not_applicable: "bg-slate-200 text-slate-500",
};

export function isActivityComplete(status: ActivityStatus) {
  return status === "done" || status === "not_applicable";
}

export const ROLE_IN_ACTIVITY_LABELS: Record<StakeholderRole, string> = {
  lead: "Leidend",
  involved: "Ook betrokken",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Actief",
  on_hold: "On hold",
  completed: "Afgerond",
  archived: "Gearchiveerd",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  editor: "Bewerker",
  viewer: "Lezer",
};

export const ENTITY_LABELS: Record<string, string> = {
  project: "Project",
  phase: "Fase",
  activity: "Activiteit",
  activity_conflict: "Belangenconflict",
  stakeholder: "Stakeholder",
  doc_link: "Documentatielink",
  doc_file: "Document",
  comment: "Comment",
};

export const FIELD_LABELS: Record<string, string> = {
  name: "naam",
  description: "omschrijving",
  status: "status",
  startDate: "startdatum",
  endDate: "einddatum",
  leaderName: "projectleider",
  leaderEmail: "e-mail projectleider",
  sortOrder: "volgorde",
  number: "nummer",
  result: "resultaat",
  activityId: "activiteit",
  role: "rol",
  phaseId: "fase",
  contactPerson: "contactpersoon",
  email: "e-mail",
  phone: "telefoon",
  deadline: "deadline",
  activities: "activiteiten",
  interests: "belangen en eisen",
  profile: "achtergrond",
  statusChangedBy: "status gewijzigd door",
  statusChangedAt: "status gewijzigd op",
  title: "titel",
  url: "URL",
  body: "tekst",
  labels: "labels",
  editedAt: "bewerkt op",
  deletedAt: "verwijderd",
  filename: "bestandsnaam",
};

export function isComplete(status: StakeholderStatus) {
  return status === "done" || status === "not_applicable";
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Labels that can be put on comments. Add an entry here to offer a new label; the key is what
 * is stored in comments.labels. Keys that are removed later are simply no longer shown.
 */
export const COMMENT_LABELS = [
  { key: "pas_op", label: "let op", className: "bg-red-100 text-red-800 ring-red-300" },
  { key: "actie", label: "Actie nodig", className: "bg-amber-100 text-amber-900 ring-amber-300" },
  { key: "vraag", label: "Vraag", className: "bg-sky-100 text-sky-900 ring-sky-300" },
  { key: "besluit", label: "Besluit", className: "bg-green-100 text-green-800 ring-green-300" },
  { key: "info", label: "Ter info", className: "bg-slate-100 text-slate-700 ring-slate-300" },
] as const;

export type CommentLabelKey = (typeof COMMENT_LABELS)[number]["key"];

export const WARNING_LABEL: CommentLabelKey = "pas_op";

export function commentLabel(key: string) {
  return COMMENT_LABELS.find((l) => l.key === key);
}
