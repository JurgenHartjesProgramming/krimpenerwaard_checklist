/**
 * Reader for the stakeholder Word document ("Stakeholders bij gebiedsontwikkeling voor woningbouw").
 *
 * Every "Heading 2" like "1.1 Gemeente" starts a stakeholder section. Per section this returns:
 *   - profile: the text up to "Bronnen" ("## " = bold sub-heading, "• " = list item);
 *   - sources: every hyperlink in the section (title = text before the link in that paragraph).
 * Reading stops at the "Heading 1" with the conflict analysis / stakeholder matrix.
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";

export interface Source {
  title: string;
  url: string;
}

export interface StakeholderSection {
  heading: string;
  name: string;
  profile: string;
  sources: Source[];
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const runText = (xml: string) =>
  (xml.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>/g) ?? [])
    .map((t) => (t === "<w:tab/>" ? " " : decode(t.replace(/<[^>]+>/g, ""))))
    .join("");

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Profile text: blank line before each heading, no repeated or trailing blank lines. */
function toProfile(lines: string[]): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.startsWith("## ") && out.length && out[out.length - 1] !== "") out.push("");
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

export async function readStakeholderDoc(path: string): Promise<StakeholderSection[]> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const doc = await zip.file("word/document.xml")!.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, decode(target));
  }

  const body = doc.split("<w:body>")[1] ?? doc;
  const blocks = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const sections: (StakeholderSection & { lines: string[] })[] = [];
  let current: (typeof sections)[number] | null = null;
  let inSources = false;

  for (const b of blocks) {
    if (b.startsWith("<w:tbl>")) {
      if (!current || inSources) continue;
      for (const tr of b.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((c) => clean(runText(c))).filter(Boolean);
        if (cells.length) current.lines.push(`• ${cells.join(" | ")}`);
      }
      continue;
    }
    const style = b.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = clean(runText(b));
    if (/^(Heading|Kop)1$/i.test(style)) {
      current = null;
      if (/conflict|matrix/i.test(text)) break;
      continue;
    }
    if (/^(Heading|Kop)2$/i.test(style)) {
      const m = text.match(/^\d+\.\d+\s+(.+)$/);
      current = m ? { heading: text, name: m[1].trim(), profile: "", sources: [], lines: [] } : null;
      if (current) sections.push(current);
      inSources = false;
      continue;
    }
    if (!current) continue;

    // Sources: every hyperlink in the section; title = paragraph text before the (first) link.
    const links = [...b.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g)];
    if (links.length) {
      const beforeFirst = clean(runText(b.slice(0, links[0].index)));
      for (const l of links) {
        const rid = l[1].match(/r:id="([^"]+)"/)?.[1];
        const url = rid ? targets.get(rid) : undefined;
        if (!url || !/^https?:\/\//i.test(url)) continue;
        const linkText = clean(runText(l[2]));
        const title = (links.length === 1 ? beforeFirst : "").replace(/[\s:–-]+$/, "").trim() || linkText || url;
        if (!current.sources.some((s) => s.url === url)) current.sources.push({ title, url });
      }
    }

    // Profile: everything up to "Bronnen".
    if (inSources) continue;
    if (!text) {
      current.lines.push("");
      continue;
    }
    if (/^bronnen:?$/i.test(text)) {
      inSources = true;
      continue;
    }
    // Word writes both <w:b/> and <w:b w:val="1" /> (with or without a space before "/>").
    const bold = /<w:b\s*\/>|<w:b w:val="(1|true)"\s*\/>/.test(b) && !/<w:b w:val="(0|false)"\s*\/>/.test(b);
    if (bold && text.length < 120 && !/[.:]$/.test(text)) current.lines.push(`## ${text}`);
    else if (/<w:numPr>/.test(b) || /^List/i.test(style)) current.lines.push(`• ${text}`);
    else current.lines.push(text);
  }

  return sections.map(({ lines, ...s }) => ({ ...s, profile: toProfile(lines) }));
}

/** Filler words ignored when matching names ("Beheerders van landelijke transportnetten" = "Beheerders landelijke transportnetten"). */
const FILLER = new Set(["en", "van"]);

/** Loose name key for matching document headings to stakeholder names: case, "/", filler words, punctuation ignored. */
export const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[/,()–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
