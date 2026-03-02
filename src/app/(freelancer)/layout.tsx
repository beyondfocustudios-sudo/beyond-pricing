import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default function FreelancerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden" style={{ background: "var(--bf-bg, #F5F6FA)" }}>
      <Sidebar area="freelancer" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar activeToggle="team" />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
