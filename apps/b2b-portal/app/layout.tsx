import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster, TooltipProvider } from "@jewellery/ui";
import { SiteFooter } from "../components/site-footer";
import { WholesaleHeader } from "../components/wholesale-header";
import { StoreProvider } from "../lib/store-context";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Suvarna Wholesale — B2B Portal",
  description: "Wholesale ordering, price lists and account management for Suvarna's registered retail partners.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${jakarta.variable}`}>
        <TooltipProvider delayDuration={200}>
          <StoreProvider>
            <div className="flex min-h-screen flex-col">
              <WholesaleHeader />
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
