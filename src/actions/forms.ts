import { z } from "zod";

/** Shared zod helpers for FormData input. */

export const requiredText = (label: string, max = 500) =>
  z
    .string({ error: `${label} is verplicht.` })
    .trim()
    .min(1, `${label} is verplicht.`)
    .max(max, `${label} is te lang.`);

export const optionalText = (max = 5000) => z.string().trim().max(max).optional().default("");

export const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

export const optionalEmail = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Ongeldig e-mailadres.");

export const version = z.coerce.number().int().positive();
export const id = z.uuid();

export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
