import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Beyond Pricing
        </h1>
        <p className="mt-3 text-lg text-gray-600">
          Orçamentos de produção inteligentes
        </p>
      </div>
      <Link href="/login" className="btn-primary text-base px-8 py-3">
        Entrar
      </Link>
    </div>
  );
}
