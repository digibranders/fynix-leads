import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Bottom-left (the default) sits on the rail's footer note.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      // The reset token is in the URL of this page: send no referrer from it and cache nothing.
      { source: "/reset-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/sign-in", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
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
