import { redirect } from "next/navigation";
import { DEV_LOGIN_PROVIDER, signIn } from "@/auth";
import { DEV_USERS } from "@/lib/dev-users";
import { validateEnv } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  tenant: "Je account hoort niet bij een organisatie die toegang heeft tot deze applicatie.",
  AccessDenied: "Je account hoort niet bij een organisatie die toegang heeft tot deze applicatie.",
  Configuration: "De inlogconfiguratie klopt niet. Controleer de .env-instellingen (npm run check-env).",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const env = validateEnv();

  return (
    <div className="relative isolate">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/polder.svg)" }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/70 via-brand-900/35 to-brand-900/10" />

      <div className="container-page grid min-h-[70vh] items-center gap-8 py-12 lg:grid-cols-2">
        <div className="text-white">
          <h1 className="text-4xl font-bold drop-shadow-sm sm:text-5xl">Welkom</h1>
          <p className="mt-3 max-w-md text-lg text-white/90">
            Houd per project bij welke stakeholders in welke fase benaderd moeten worden, met documentatie en
            overleg op één plek.
          </p>
        </div>

        <div className="space-y-4">
          <div className="card border-t-4 border-t-brand-700 p-6">
            <h2 className="mb-2 text-2xl font-bold text-brand-900">Inloggen</h2>
            {error && (
              <p role="alert" className="mb-4 rounded-sm border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
                {ERRORS[error] ?? "Inloggen is mislukt. Probeer het opnieuw."}
              </p>
            )}
            {env.entraConfigured ? (
              <>
                <p className="mb-5 text-slate-700">Log in met je Microsoft-account van de organisatie.</p>
                <form
                  action={async () => {
                    "use server";
                    await signIn("microsoft-entra-id", { redirectTo: "/" });
                  }}
                >
                  <button className="btn-primary w-full py-2.5 text-base">Inloggen met Microsoft</button>
                </form>
              </>
            ) : (
              <p className="text-slate-700">Inloggen met Microsoft is nog niet ingesteld. Neem contact op met de beheerder.</p>
            )}
          </div>

          {env.devLoginEnabled && (
            <div className="card border-l-4 border-l-accent-500 p-5">
              <h2 className="mb-1 font-bold text-slate-900">Ontwikkel-login</h2>
              <p className="mb-3 text-sm text-slate-600">
                Alleen zichtbaar bij <code>npm run dev</code>. Bestaat niet in een productie-build.
              </p>
              <div className="grid gap-2">
                {DEV_USERS.map((u) => (
                  <form
                    key={u.key}
                    action={async () => {
                      "use server";
                      await signIn(DEV_LOGIN_PROVIDER, { userKey: u.key, redirectTo: "/" });
                    }}
                  >
                    <button className="btn-secondary w-full justify-between">
                      <span>{u.name}</span>
                      <span className="text-xs font-normal text-slate-500">
                        {u.role ? ROLE_LABELS[u.role] : "in afwachting"} · {u.description}
                      </span>
                    </button>
                  </form>
                ))}
              </div>
              {(env.errors.length > 0 || env.warnings.length > 0) && (
                <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
                  <p className="mb-1 font-semibold text-slate-800">Controle van .env</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {env.errors.map((e) => (
                      <li key={e} className="text-red-800">
                        {e}
                      </li>
                    ))}
                    {env.warnings.map((w) => (
                      <li key={w} className="text-amber-800">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
