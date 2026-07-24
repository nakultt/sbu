import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import AppShell from "@/components/AppShell";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: { default: "Study Buddy", template: "%s · Study Buddy" },
  description: "A private, local-first workspace for notes, lectures, and focused study.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-[15px]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
