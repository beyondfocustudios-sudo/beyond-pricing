import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const access = await resolveAccessRole(supabase, user);
  if (access.isClient) redirect("/portal");
  if (access.isCollaborator && !access.isTeam) redirect("/app/collaborator");
  redirect("/app/dashboard");
}
