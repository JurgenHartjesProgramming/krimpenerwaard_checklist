"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: "Checklist", match: (p: string) =>
        p === base || ["stakeholders", "activities", "phases"].some((seg) => p.startsWith(`${base}/${seg}`)),
    },
    { href: `${base}/documents`, label: "Documenten" },
    { href: `${base}/history`, label: "Geschiedenis" },
    ...(isAdmin
      ? [
          { href: `${base}/copy`, label: "Kopiëren uit project" },
          { href: `${base}/settings`, label: "Projectgegevens" },
        ]
      : []),
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Projectonderdelen" className="-mb-px flex flex-wrap">
        {tabs.map((t) => {
          const active = "match" in t && t.match ? t.match(pathname) : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`border-b-4 px-4 py-3 text-[15px] font-semibold ${
                active ? "border-brand-700 text-brand-900" : "border-transparent text-slate-600 hover:text-brand-800"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <a href={`${base}/export`} className="btn-secondary my-2">
        Exporteer naar Excel
      </a>
    </div>
  );
}
