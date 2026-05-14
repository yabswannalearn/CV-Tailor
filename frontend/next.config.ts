import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  transpilePackages: ["react-pdf"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://cv-tailor-backend.fastapicloud.dev/:path*",
      },
    ];
  },
};

export default nextConfig;