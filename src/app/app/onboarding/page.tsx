import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function AppOnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await resolveAccessRole(supabase, user);
  if (!access.isTeam && !access.isCollaborator) {
    redirect("/portal/login?mismatch=1");
  }

  return <OnboardingWizard scope={access.isCollaborator && !access.isTeam ? "app_collab" : "app_team"} />;
}
