import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { CartDrawer } from "../components/layout/cart-drawer";
import { AnnouncementBar } from "../components/layout/announcement-bar";
import { SiteFooter } from "../components/layout/site-footer";
import { SiteHeader } from "../components/layout/site-header";
import { Providers } from "../lib/providers";
import { jsonLd, organizationJsonLd, websiteJsonLd } from "../lib/seo";
import { getContent, getNavigation } from "../lib/server-data";
import { SITE_URL } from "../lib/site";
import "./globals.css";

// The shell (navigation, announcement, brand) is read per request, so it is never frozen at build time with whatever the API answered then.
export const dynamic = "force-dynamic";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const description = content.tagline ?? `${content.brandName} — jewellery priced live against today's metal rate.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${content.brandName} — Fine jewellery`, template: `%s — ${content.brandName}` },
    description,
    openGraph: { type: "website", siteName: content.brandName, title: `${content.brandName} — Fine jewellery`, description, url: SITE_URL, locale: "en_IN" },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = { themeColor: "#f7f5f2", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [content, navigation] = await Promise.all([getContent(), getNavigation()]);
  return (
    <html lang="en-IN" data-theme="light">
      <head>
        {/* Images are shown even where JavaScript is off; the fade-in is an enhancement. */}
        <noscript><style>{".pi{opacity:1!important;filter:none!important}"}</style></noscript>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([organizationJsonLd(content), websiteJsonLd(content.brandName)]) }} />
      </head>
      <body className={`${fraunces.variable} ${jakarta.variable}`}>
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-foreground focus:px-4 focus:py-3 focus:text-background">Skip to content</a>
          <AnnouncementBar announcements={content.announcements} />
          <SiteHeader content={content} navigation={navigation} />
          <main id="main" className="min-h-[60vh]">{children}</main>
          <SiteFooter content={content} navigation={navigation} />
          <CartDrawer />
        </Providers>
      </body>
    </html>
  );
}
