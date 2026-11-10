import type { NextConfig } from "next";

// Cache Components is intentionally left off: every page in this app is
// per-user (session cookie + access checks), so there is no meaningful static
// shell to prerender, and the classic dynamic model keeps auth reads simple.
const nextConfig: NextConfig = {
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
