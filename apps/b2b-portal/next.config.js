/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@jewellery/ui", "@jewellery/types", "@jewellery/validation"],
  reactStrictMode: true,
};

module.exports = nextConfig;
