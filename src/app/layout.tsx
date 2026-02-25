import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const themeInitScript = `
(() => {
  try {
    let theme = localStorage.getItem("bp_theme");
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch {}
})();
`;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Beyond Pricing",
    template: "%s · Beyond Pricing",
  },
  description: "Plataforma premium de orçamentação para produção audiovisual e criativa.",
  keywords: ["orçamentos", "produção audiovisual", "pricing", "beyond"],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#080b10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full min-h-dvh w-full antialiased">{children}</body>
    </html>
  );
}
