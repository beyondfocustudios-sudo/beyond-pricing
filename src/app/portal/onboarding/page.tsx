import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function PortalOnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login?mode=client");

  const access = await resolveAccessRole(supabase, user);
  if (!access.isClient) {
    redirect(access.isCollaborator ? "/app/collaborator" : "/app/dashboard");
  }

  return <OnboardingWizard scope="client" />;
}
