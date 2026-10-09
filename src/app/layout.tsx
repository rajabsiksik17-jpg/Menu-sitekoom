import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { dirOf, isLang } from "@/lib/i18n";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "POS-SITEKOOM Menu", template: "%s" },
  description: "Restaurant QR menu and table ordering",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0B5CAD" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("lang")?.value;
  const l = isLang(lang) ? lang : "ar";
  return (
    <html lang={l} dir={dirOf(l)} className={plex.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
