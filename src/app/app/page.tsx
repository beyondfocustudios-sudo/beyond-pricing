import { redirect } from "next/navigation";
import DashboardHome from "@/components/dashboard/dashboard-home";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";

export default async function AppHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?mode=team");

  const access = await resolveAccessRole(supabase, user);
  if (access.isCollaborator && !access.isTeam) {
    redirect("/app/collaborator");
  }

  return <DashboardHome />;
}
