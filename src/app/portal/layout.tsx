"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { LogOut, Folder, ChevronRight } from "lucide-react";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/portal/login");
        return;
      }
      setEmail(data.user.email ?? null);
      setLoading(false);
    });
  }, [router]);

  const handleLogout = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/portal/login");
  };

  // Don't render layout on login page
  if (pathname === "/portal/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f5f5f7" }}>
        <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#1a8fa3", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f5f5f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" }}>
      {/* Top bar */}
      <header style={{
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/portal" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a8fa3, #0d6b7e)" }}>
              <span className="text-xs font-bold text-white">B</span>
            </div>
            <span className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>Beyond Portal</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-xs hidden sm:block" style={{ color: "#86868b" }}>{email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(0,0,0,0.05)", color: "#1d1d1f" }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
