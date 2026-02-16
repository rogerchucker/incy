import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Incy — Incident Management",
  description: "Reliable incident management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="min-h-screen bg-background">
            <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="container mx-auto flex h-14 items-center px-4">
                <Link href="/" className="mr-8 flex items-center space-x-2">
                  <span className="text-xl font-bold">Incy</span>
                </Link>
                <div className="flex items-center space-x-6 text-sm font-medium">
                  <Link
                    href="/incidents"
                    className="transition-colors hover:text-foreground/80 text-foreground/60"
                  >
                    Incidents
                  </Link>
                  <Link
                    href="/services"
                    className="transition-colors hover:text-foreground/80 text-foreground/60"
                  >
                    Services
                  </Link>
                  <Link
                    href="/schedules"
                    className="transition-colors hover:text-foreground/80 text-foreground/60"
                  >
                    Schedules
                  </Link>
                  <Link
                    href="/escalation-policies"
                    className="transition-colors hover:text-foreground/80 text-foreground/60"
                  >
                    Escalation
                  </Link>
                </div>
              </div>
            </nav>
            <main className="container mx-auto px-4 py-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
