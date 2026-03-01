/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@exoskull/ui",
    "@exoskull/engine",
    "@exoskull/store",
    "@exoskull/types",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ],
    },
  ],
};

module.exports = nextConfig;
