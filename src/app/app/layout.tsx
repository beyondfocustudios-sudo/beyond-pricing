import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Env guard — surface misconfiguration immediately
  const missingEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ThemeProvider>
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
      <AppShell userEmail={user.email ?? ""}>
        {children}
      </AppShell>
    </ToastProvider>
    </ThemeProvider>
  );
}
