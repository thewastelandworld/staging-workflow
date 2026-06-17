import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { DarkModeProvider } from "@/components/DarkModeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SessionProvider } from "@/components/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Staging Workflow",
  description: "チームリレー型ステージ管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <Suspense fallback={null}>
        <body className="min-h-full flex flex-col">
          <SessionProvider>
            <LanguageProvider>
              <DarkModeProvider>{children}</DarkModeProvider>
            </LanguageProvider>
          </SessionProvider>
        </body>
      </Suspense>
    </html>
  );
}
