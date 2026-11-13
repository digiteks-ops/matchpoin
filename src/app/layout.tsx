import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "MATCHPOIN — Tennis Matchmaking & Player Rating Platform",
  description:
    "Connect. Compete. Improve. Temukan lawan tanding tenis seimbang, jadwalkan pertandingan, dan tingkatkan MATCHPOIN Rating Anda di Makassar.",
  keywords: [
    "tennis",
    "makassar",
    "matchmaking tenis",
    "tenis makassar",
    "player rating",
    "komunitas tenis indonesia",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={fontSans.variable}>
      <body className="font-sans min-h-screen flex flex-col bg-[#F4F5F7] text-slate-900 antialiased selection:bg-matchpoin-tennis selection:text-matchpoin-navy">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
