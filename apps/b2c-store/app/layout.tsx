import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster, TooltipProvider } from "@jewellery/ui";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { StoreProvider } from "../lib/store-context";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Suvarna — Fine Jewellery",
  description: "Hallmarked gold, diamond and silver jewellery, priced live against today's metal rate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className={`${fraunces.variable} ${jakarta.variable}`}>
        <TooltipProvider delayDuration={200}>
          <StoreProvider>
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
          </StoreProvider>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
