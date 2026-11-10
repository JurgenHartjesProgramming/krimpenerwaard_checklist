/**
 * Upload rules for documentation files. File contents live in the `blobs` table; keep all
 * blob access in this module and the download route so storage can move to e.g. Azure Blob later.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  txt: "text/plain",
};

export const ALLOWED_EXTENSIONS = Object.keys(MIME_TYPES);

export function mimeFor(ext: string): string {
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
