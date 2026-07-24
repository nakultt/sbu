import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import AppShell from "@/components/AppShell";
import ThemeProvider from "@/components/ThemeProvider";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: { default: "Study Buddy", template: "%s · Study Buddy" },
  description: "A private, local-first workspace for notes, lectures, and focused study.",
};

// Applies stored theme/accent/grid preferences to <html> before paint so the
// first render matches the saved appearance (no light-mode flash).
const themeBootstrap = `try{var p=JSON.parse(localStorage.getItem('axiom-prefs')||'{}');document.documentElement.setAttribute('data-theme',p.theme||'dark');if(p.accent)document.documentElement.style.setProperty('--accent',p.accent);document.documentElement.style.setProperty('--grid-opacity',p.grid===false?'0':'0.35');}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full text-[15px]">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
