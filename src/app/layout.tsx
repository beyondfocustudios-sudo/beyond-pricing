import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beyond Pricing — Orçamentos de Produção",
  description:
    "Plataforma de orçamentação para produção audiovisual e criativa.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
