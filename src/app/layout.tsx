import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import { signOut } from "@/auth";
import { getCurrentUser, hasRole } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/labels";
import "./globals.css";

const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Krimpenerwaard Checklist",
  description: "Stakeholderchecklist per projectfase",
};

/** Simple emblem: polder with ditches and a mill (not an official municipal logo). */
function Emblem() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="4" fill="#0f5f3a" />
      <path d="M0 26 L40 26 L40 40 L0 40Z" fill="#3f9a5f" />
      <path d="M20 26 L4 40 M20 26 L14 40 M20 26 L26 40 M20 26 L36 40" stroke="#bfe0f2" strokeWidth="1.6" />
      <path d="M27 26 L28.5 17 L31.5 17 L33 26Z" fill="#fff" />
      <path d="M30 17 l-6 -6 M30 17 l6 -6 M30 17 l-6 6 M30 17 l6 6" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const active = user?.status === "active" && !!user.role;

  return (
    <html lang="nl" className={sourceSans.variable}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
          Naar de inhoud
        </a>
        <div className="bg-brand-900 text-sm text-white/85">
          <div className="container-page flex h-9 items-center justify-between">
            <span>Interne projectomgeving</span>
            {user && (
              <div className="flex items-center gap-3">
                <span>
                  {user.name}
                  {user.role && active && <span className="ml-1 text-white/60">· {ROLE_LABELS[user.role]}</span>}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button className="font-semibold text-white underline-offset-2 hover:underline">Uitloggen</button>
                </form>
              </div>
            )}
          </div>
        </div>
        <header className="border-b-4 border-brand-700 bg-white">
          <div className="container-page flex flex-wrap items-center justify-between gap-4 py-4">
            <Link href="/" className="flex items-center gap-3">
              <Emblem />
              <span className="leading-tight">
                <span className="block text-xl font-bold text-brand-900">Krimpenerwaard</span>
                <span className="block text-sm text-slate-600">Stakeholderchecklist</span>
              </span>
            </Link>
            {active && (
              <nav aria-label="Hoofdmenu" className="flex gap-1 text-[15px] font-semibold">
                <Link href="/" className="rounded-sm px-3 py-2 text-brand-800 hover:bg-brand-50">
                  Projecten
                </Link>
                {hasRole(user, "admin") && (
                  <>
                    <Link href="/projects/new" className="rounded-sm px-3 py-2 text-brand-800 hover:bg-brand-50">
                      Nieuw project
                    </Link>
                    <Link href="/admin/users" className="rounded-sm px-3 py-2 text-brand-800 hover:bg-brand-50">
                      Gebruikers
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="mt-12 bg-brand-900 text-white/85">
          <div className="container-page grid gap-6 py-8 text-sm sm:grid-cols-3">
            <div>
              <p className="mb-1 font-bold text-white">Krimpenerwaard Checklist</p>
              <p>Overzicht van stakeholders per projectfase.</p>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">Snel naar</p>
              <ul className="space-y-1">
                <li>
                  <Link href="/" className="hover:underline">
                    Projecten
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">Hulp nodig?</p>
              <p>Neem contact op met de beheerder van deze applicatie.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
