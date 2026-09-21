/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig = {
  transpilePackages: ["@jewellery/ui", "@jewellery/types", "@jewellery/validation"],
  reactStrictMode: true,
  // The browser talks to the SAME origin; Next forwards the public storefront API to the backend. No CORS, and the
  // API's address is not baked into the client bundle. (Server components call the API directly — see lib/api.ts.)
  async rewrites() {
    return [{ source: "/api/store/:path*", destination: `${API_URL}/api/store/:path*` }];
  },
};

module.exports = nextConfig;
