import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Page banner with the polder landscape as background, in the style of municipal websites.
 * Replace public/images/polder.svg with a photo (e.g. polder.jpg) to change the background.
 */
export function PageHero({
  title,
  intro,
  crumbs,
  size = "compact",
  children,
}: {
  title: string;
  intro?: string;
  crumbs?: Crumb[];
  size?: "large" | "compact";
  children?: ReactNode;
}) {
  return (
    <div className={`relative isolate overflow-hidden ${size === "large" ? "min-h-72" : "min-h-44"}`}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/polder.svg)" }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-900/85 via-brand-900/55 to-transparent" />
      <div className={`container-page flex flex-col justify-end ${size === "large" ? "min-h-72 py-10" : "min-h-44 py-6"}`}>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Kruimelpad" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-white/85">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5" />}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-white hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className={`font-bold text-white drop-shadow-sm ${size === "large" ? "text-4xl sm:text-5xl" : "text-3xl"}`}>
              {title}
            </h1>
            {intro && <p className="mt-2 text-lg text-white/90">{intro}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
