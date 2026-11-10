import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // EMR-07: patient documents up to 4 MB go through a server action (Vercel's request limit is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
