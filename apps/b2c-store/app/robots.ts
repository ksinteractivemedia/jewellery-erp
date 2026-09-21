import type { MetadataRoute } from "next";
import { absoluteUrl } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/cart", "/checkout", "/orders", "/account", "/wishlist", "/search", "/api/"] }], sitemap: absoluteUrl("/sitemap.xml") };
}
