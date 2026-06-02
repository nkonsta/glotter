import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: "Glotter - Translation Management",
  description: "Modern translation management tool for your projects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var key = 'glotter-theme';
                  var stored = window.localStorage ? localStorage.getItem(key) : null;
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
                  var root = document.documentElement;
                  if (theme === 'dark') root.classList.add('dark');
                  else root.classList.remove('dark');
                  root.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
        }}
      />
        {children}
      </body>
    </html>
  );
}
