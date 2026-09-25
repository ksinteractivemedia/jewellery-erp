/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@jewellery/ui", "@jewellery/types", "@jewellery/validation"],
  reactStrictMode: true,
  // apps/api sets a full CSP via helmet(); this app served none at all. A script-src/style-src CSP needs
  // browser verification against Next's own inline hydration/style output before it can ship (get it wrong
  // and the whole app renders blank with no visible error) — deliberately left for that follow-up. These
  // headers carry no such risk and are safe unconditionally.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
