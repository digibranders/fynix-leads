import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Bottom-left (the default) sits on the rail's footer note.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
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
