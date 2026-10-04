import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

// UI / Body font — default for all text
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Display / Brand font — for headings, brand name, key metrics, primary CTAs
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Devanagari fallback — for Hindi text in bilingual UI
const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sarthi AI — Smart Listing for Indian Sellers",
  description:
    "Create accurate, SEO-optimised product listings in seconds. Speak in Hindi or Hinglish — Sarthi AI handles the rest.",
  keywords: ["seller listing", "Indian seller", "product catalog", "voice listing"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} ${notoSansDevanagari.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
