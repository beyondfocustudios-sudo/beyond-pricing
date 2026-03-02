import { PageHeader } from "@/components/layout/PageHeader";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Home"
        breadcrumbs={[{ label: "Beyond Focus" }, { label: "Home" }]}
      />
      <div
        className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed"
        style={{ borderColor: "rgba(27,73,101,0.2)", color: "#64748B" }}
      >
        <div className="text-center">
          <p className="text-lg font-semibold opacity-60">Home</p>
          <p className="text-sm opacity-40 mt-1">Em construção — coming soon</p>
        </div>
      </div>
    </div>
  );
}
