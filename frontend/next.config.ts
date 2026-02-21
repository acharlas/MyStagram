import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Protected media is served through authenticated API routes.
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
