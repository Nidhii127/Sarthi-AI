import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
