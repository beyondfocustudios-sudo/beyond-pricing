import { PageHeader } from "@/components/layout/PageHeader";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Operações"
        breadcrumbs={[{ label: "Beyond Focus" }, { label: "Operações" }]}
      />
      <div
        className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed"
        style={{ borderColor: "rgba(27,73,101,0.2)", color: "#5FA8D3" }}
      >
        <div className="text-center">
          <p className="text-lg font-semibold opacity-60">Operações</p>
          <p className="text-sm opacity-40 mt-1">Em construção — coming soon</p>
        </div>
      </div>
    </div>
  );
}
