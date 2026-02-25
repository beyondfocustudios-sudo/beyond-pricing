import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { resolveAccessRole } from "@/lib/access-role";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Env guard — surface misconfiguration immediately
  const missingEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const access = await resolveAccessRole(supabase, user);
  if (!access.isTeam && !access.isCollaborator) {
    await supabase.auth.signOut();
    if (access.isClient || access.isCollaborator) {
      redirect("/portal/login?mismatch=1");
    }
    redirect("/login?mode=team&mismatch=1");
  }

  return (
    <ThemeProvider userId={user.id}>
    <ToastProvider>
      {missingEnv && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
            background: "#dc2626", color: "white",
            padding: "0.5rem 1rem", fontSize: "0.875rem", textAlign: "center",
          }}
        >
          ⚠️ Env vars em falta — define NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
        </div>
      )}
      <AppShell userEmail={user.email ?? ""} userRole={access.role}>
        <ErrorBoundary label="aplicação">
          {children}
        </ErrorBoundary>
      </AppShell>
    </ToastProvider>
    </ThemeProvider>
  );
}
