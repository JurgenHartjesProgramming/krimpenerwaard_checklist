import { redirect } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { getCurrentUser } from "@/lib/session";

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "active" && user.role) redirect("/");
  const deactivated = user.status === "deactivated";

  return (
    <>
      <PageHero title={deactivated ? "Account gedeactiveerd" : "Wacht op goedkeuring"} />
      <div className="container-page max-w-2xl pt-6">
        <div className="card border-l-4 border-l-accent-500 p-6 text-slate-700">
          {deactivated
            ? "Je account is gedeactiveerd. Neem contact op met een beheerder als je weer toegang nodig hebt."
            : "Je bent ingelogd, maar een beheerder moet je account nog goedkeuren en een rol toekennen. Probeer het later opnieuw."}
        </div>
      </div>
    </>
  );
}
