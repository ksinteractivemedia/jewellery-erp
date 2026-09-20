import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster, TooltipProvider } from "@jewellery/ui";
import { AuthProvider } from "../lib/auth/auth-context";
import { QueryProvider } from "../lib/query-provider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jewellery ERP — Design System",
  description: "Internal design-system preview for the jewellery ERP, storefront and B2B portal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${jakarta.variable}`}>
        <TooltipProvider delayDuration={200}>
          <AuthProvider>
            <QueryProvider>{children}</QueryProvider>
          </AuthProvider>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
