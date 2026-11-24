import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/http/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  // Bottom-left (the default) sits on the rail's footer note.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  // A message may carry up to five files of 10 MB each, and they travel in the form post.
  experimental: { serverActions: { bodySizeLimit: "52mb" } },
  partialPrefetching: true,
  async headers() {
    return [
      // First, so the page rules below override a header they also set.
      { source: "/:path*", headers: [...SECURITY_HEADERS] },
      // The reset token is in the URL of this page: send no referrer from it and cache nothing.
      { source: "/reset-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/sign-in", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The invite token is in the URL of this page, like the reset token above.
      { source: "/accept-invite", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
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
